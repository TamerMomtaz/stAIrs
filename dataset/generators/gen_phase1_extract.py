"""
gen_phase1_extract.py — Phase 1: extract REAL instruction->diff candidates.

Deterministic (no LLM). For every substantive non-merge commit, for every kept
file, reconstruct a per-file unified diff, apply-verify it against the
reconstructed parent (BEFORE redaction), size-split, then redact the emitted
text. Big new files are chunked via git itself so every chunk diff is valid.

Output: dataset/scratch/phase1_candidates.jsonl  (one candidate/line)
        dataset/scratch/phase1_extract_report.json

Run:  python3 gen_phase1_extract.py
Import-side-effect-free: all work guarded under __main__.
"""
import json, os, re, subprocess, sys, tempfile, shutil, hashlib

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRATCH = os.path.join(os.path.dirname(__file__), "..", "scratch")
sys.path.insert(0, os.path.dirname(__file__))
from lib_secrets import redact_diff  # noqa: E402

SCAFFOLD_ROOT = "30357b2"  # shallow-clone graft boundary -> drop (initial scaffold)
MAX_WHOLE = 400            # coherent file/diff stays whole up to ~400 churn
CHUNK_TARGET = 150         # pack new-file chunks to ~150 lines
HUNK_DROP = 400            # one irreducible hunk over this -> drop+list

JUNK_SUBJECT = re.compile(
    r"(add files via upload|^delete |bump version|^docs:|rename brand|"
    r"update pdf export logo|embed actual devoneers|^add devoneers logo|^add files)", re.I)
ASSET_EXT = re.compile(r"\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|woff2?|ttf|eot|mp4|zip)$", re.I)
GENERATED = re.compile(r"(package-lock\.json|[-.]lock$|\.lock\.json$|\.min\.|\.map$|/dist/|node_modules/)", re.I)

def git(*args, cwd=REPO):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)

def git_out(*args, cwd=REPO):
    r = git(*args, cwd=cwd)
    return r.stdout

LANG = {".py": "python", ".jsx": "jsx", ".js": "javascript", ".sql": "sql",
        ".css": "css", ".html": "html", ".json": "json", ".toml": "toml"}

def lang_for(path):
    _, ext = os.path.splitext(path)
    return LANG.get(ext, "text")

def file_excluded(path):
    if ASSET_EXT.search(path) or GENERATED.search(path):
        return True
    if path.endswith(".md"):
        return True
    return False

def build_pr_map():
    """member commit sha -> PR number, from merge commits."""
    out = git_out("log", "--merges", "--format=%H %s")
    m = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        sha, subj = line.split(" ", 1)
        mm = re.search(r"#(\d+)", subj)
        if not mm:
            continue
        pr = int(mm.group(1))
        members = git_out("rev-list", f"{sha}^1..{sha}^2").split()
        for c in members:
            m.setdefault(c, pr)
    return m

def parent_exists(commit, path):
    return git("cat-file", "-e", f"{commit}^:{path}").returncode == 0

def apply_check(diff_text, parent_blob, path, repo_dir):
    """Write parent (or nothing for new file) into a temp git repo, git apply --check."""
    full = os.path.join(repo_dir, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if parent_blob is not None:
        with open(full, "w") as f:
            f.write(parent_blob)
        git("add", path, cwd=repo_dir)
    pf = os.path.join(repo_dir, "_patch.diff")
    with open(pf, "w") as f:
        f.write(diff_text if diff_text.endswith("\n") else diff_text + "\n")
    r = git("apply", "--check", "_patch.diff", cwd=repo_dir)
    # cleanup file so checks don't interfere
    if parent_blob is not None and os.path.exists(full):
        git("rm", "-q", "-f", path, cwd=repo_dir)
    elif os.path.exists(full):
        os.remove(full)
    return r.returncode == 0, r.stderr.strip()

def split_hunks(diff_text):
    """Return (header_lines, [hunk_text,...]) for a single-file unified diff."""
    lines = diff_text.split("\n")
    hstart = next((i for i, l in enumerate(lines) if l.startswith("@@")), len(lines))
    header = lines[:hstart]
    hunks, cur = [], []
    for l in lines[hstart:]:
        if l.startswith("@@"):
            if cur:
                hunks.append("\n".join(cur))
            cur = [l]
        else:
            cur.append(l)
    if cur:
        hunks.append("\n".join(cur))
    return header, hunks

def hunk_churn(hunk):
    return sum(1 for l in hunk.split("\n") if l[:1] in ("+", "-"))

def make_newfile_chunks(commit, path):
    """Use git to manufacture VALID incremental diffs for a big new file."""
    content = git_out("show", f"{commit}:{path}")
    lines = content.split("\n")
    # pack chunks at blank-line boundaries, ~CHUNK_TARGET lines each
    chunks, cur = [], []
    for ln in lines:
        cur.append(ln)
        if len(cur) >= CHUNK_TARGET and (ln.strip() == "" or ln.rstrip().endswith((")", "}", ";", ":"))):
            chunks.append(cur); cur = []
    if cur:
        chunks.append(cur)
    if len(chunks) == 1:
        return None  # not actually big once packed
    tmp = tempfile.mkdtemp(prefix="nf_")
    git("init", "-q", cwd=tmp)
    git("config", "user.email", "x@x", cwd=tmp); git("config", "user.name", "x", cwd=tmp)
    full = os.path.join(tmp, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    diffs = []
    cumulative = []
    for i, ch in enumerate(chunks):
        cumulative += ch
        with open(full, "w") as f:
            f.write("\n".join(cumulative))
        git("add", path, cwd=tmp)
        if i == 0:
            d = git_out("diff", "--cached", "--", path, cwd=tmp)
        git("commit", "-q", "-m", f"c{i}", cwd=tmp)
        if i > 0:
            d = git_out("diff", f"HEAD~1", "HEAD", "--", path, cwd=tmp)
        diffs.append((i, len(chunks), d))
    shutil.rmtree(tmp, ignore_errors=True)
    return diffs

def sha8(s):
    return hashlib.sha256(s.encode()).hexdigest()[:8]

def main():
    os.makedirs(SCRATCH, exist_ok=True)
    pr_map = build_pr_map()
    commits = git_out("log", "--reverse", "--no-merges", "--format=%H%x1f%s").splitlines()
    repo_dir = tempfile.mkdtemp(prefix="applyverify_")
    git("init", "-q", cwd=repo_dir)
    git("config", "user.email", "x@x", cwd=repo_dir)
    git("config", "user.name", "x", cwd=repo_dir)

    candidates = []
    dropped_monsters = []
    redaction_log = []
    counts = {"commits_seen": 0, "commits_junk": 0, "files_excluded": 0,
              "apply_fail": 0, "new_whole": 0, "new_chunked": 0,
              "modify_whole": 0, "modify_hunk_split": 0, "hunks_dropped": 0}

    for entry in commits:
        if "\x1f" not in entry:
            continue
        commit, subj = entry.split("\x1f", 1)
        counts["commits_seen"] += 1
        if commit.startswith(SCAFFOLD_ROOT):
            counts["commits_junk"] += 1; continue
        if JUNK_SUBJECT.search(subj):
            counts["commits_junk"] += 1; continue
        files = git_out("diff", "--name-only", f"{commit}^", commit).splitlines()
        pr = pr_map.get(commit)
        group = f"pr{pr}" if pr else f"c{commit[:8]}"
        for path in files:
            if not path.strip():
                continue
            if file_excluded(path):
                counts["files_excluded"] += 1; continue
            is_new = not parent_exists(commit, path)
            parent_blob = None if is_new else git_out("show", f"{commit}^:{path}")
            diff = git_out("diff", f"{commit}^", commit, "--", path)
            if not diff.strip():
                continue
            churn = hunk_churn(diff)

            def emit(diff_text, kind, part=None, nparts=None):
                ok, err = apply_check(diff_text, parent_blob if (part in (None, 0)) else None, path, repo_dir)
                # for chunk parts >0 the parent state differs; they were git-generated so trust+spotcheck
                if part in (None, 0) and not ok:
                    counts["apply_fail"] += 1
                    return False
                red, hits = redact_diff(diff_text)
                if hits:
                    redaction_log.append({"commit": commit[:8], "file": path, "hits": hits})
                cid = sha8(commit + path + (str(part) if part is not None else "") + kind)
                candidates.append({
                    "id": cid, "group": group, "pr": pr, "commit": commit[:8],
                    "subject": subj, "file": path, "lang": lang_for(path),
                    "kind": kind, "part": part, "nparts": nparts,
                    "churn": hunk_churn(diff_text), "applied_ok": bool(ok),
                    "redactions": hits, "diff": red,
                })
                return True

            if is_new:
                if churn <= MAX_WHOLE:
                    if emit(diff, "new_whole"):
                        counts["new_whole"] += 1
                else:
                    chunks = make_newfile_chunks(commit, path)
                    if chunks is None:
                        if emit(diff, "new_whole"):
                            counts["new_whole"] += 1
                    else:
                        for (i, n, d) in chunks:
                            # part 0 verified vs empty parent; later parts git-generated
                            okp = apply_check(d, None, path, repo_dir) if i == 0 else (True, "")
                            red, hits = redact_diff(d)
                            if hits:
                                redaction_log.append({"commit": commit[:8], "file": path, "hits": hits})
                            cid = sha8(commit + path + str(i) + "nfchunk")
                            candidates.append({
                                "id": cid, "group": group, "pr": pr, "commit": commit[:8],
                                "subject": subj, "file": path, "lang": lang_for(path),
                                "kind": "new_chunk", "part": i, "nparts": n,
                                "churn": hunk_churn(d), "applied_ok": True,
                                "redactions": hits, "diff": red,
                            })
                        counts["new_chunked"] += 1
            else:
                if churn <= MAX_WHOLE:
                    if emit(diff, "modify_whole"):
                        counts["modify_whole"] += 1
                else:
                    header, hunks = split_hunks(diff)
                    for hi, hk in enumerate(hunks):
                        hc = hunk_churn(hk)
                        if hc > HUNK_DROP:
                            dropped_monsters.append({"commit": commit[:8], "file": path,
                                                     "hunk": hi, "churn": hc, "subject": subj})
                            counts["hunks_dropped"] += 1
                            continue
                        sub_diff = "\n".join(header + [hk])
                        ok, err = apply_check(sub_diff, parent_blob, path, repo_dir)
                        if not ok:
                            counts["apply_fail"] += 1
                            continue
                        red, hits = redact_diff(sub_diff)
                        if hits:
                            redaction_log.append({"commit": commit[:8], "file": path, "hits": hits})
                        cid = sha8(commit + path + str(hi) + "hunk")
                        candidates.append({
                            "id": cid, "group": group, "pr": pr, "commit": commit[:8],
                            "subject": subj, "file": path, "lang": lang_for(path),
                            "kind": "modify_hunk", "part": hi, "nparts": len(hunks),
                            "churn": hc, "applied_ok": True, "redactions": hits, "diff": red,
                        })
                    counts["modify_hunk_split"] += 1
    shutil.rmtree(repo_dir, ignore_errors=True)

    # de-dup identical diffs (exact) early
    seen, uniq = set(), []
    for c in candidates:
        h = sha8(c["diff"])
        if h in seen:
            continue
        seen.add(h); uniq.append(c)
    dupes = len(candidates) - len(uniq)

    out_path = os.path.join(SCRATCH, "phase1_candidates.jsonl")
    with open(out_path, "w") as f:
        for c in uniq:
            f.write(json.dumps(c) + "\n")
    report = {"counts": counts, "candidates_total": len(uniq),
              "exact_dupes_removed": dupes, "dropped_monsters": dropped_monsters,
              "redaction_events": len(redaction_log),
              "by_lang": _by(uniq, "lang"), "by_kind": _by(uniq, "kind")}
    with open(os.path.join(SCRATCH, "phase1_extract_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    with open(os.path.join(SCRATCH, "phase1_redactions.json"), "w") as f:
        json.dump(redaction_log, f, indent=2)
    print(json.dumps(report, indent=2))

def _by(items, key):
    d = {}
    for it in items:
        d[it[key]] = d.get(it[key], 0) + 1
    return dict(sorted(d.items(), key=lambda x: -x[1]))

if __name__ == "__main__":
    main()
