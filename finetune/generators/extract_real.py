"""
extract_real.py — Phase 1 real-pair extraction.

Walks the pinned git history and turns (commit, file) changes into
instruction->unified-diff *units*. Each emitted unit is a self-contained,
secret-redacted unified diff that is VERIFIED to apply cleanly (git apply
--check --recount) against the reconstructed parent. The instruction text is
authored later (Phase 1 fan-out); here we only produce the diff side + metadata.

Outputs (finetune/out/):
  real_units.jsonl     one JSON object per unit
  real_dropped.json    monsters + filtered files (for the report)
  extract_meta.json    pinned HEAD, counts, knobs

Determinism: pins HEAD; no randomness. Order is history order.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import lib_secrets

ROOT = Path(__file__).resolve().parents[2]          # repo root (stAIrs/)
OUT = ROOT / "finetune" / "out"
OUT.mkdir(parents=True, exist_ok=True)

# ─── knobs ───
SMALL_WHOLE = 150     # modified files with <= this many changed lines -> one unit
NEW_WHOLE = 450       # added files with <= this many lines -> one whole unit
MONSTER = 400         # a single hunk with > this many changed lines is dropped
CHUNK_MAX = 380       # target max lines per chunk when splitting a big new file

INCLUDE_EXT = {".py", ".js", ".jsx", ".ts", ".tsx", ".sql", ".css"}
EXCLUDE_PATH = re.compile(
    r"(^|/)(node_modules|dist|build|\.next|coverage|__pycache__|\.venv|venv)/|"
    r"\.min\.(js|css)$|\.map$|package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$"
)

# Commit messages we never mine (low-signal or noise).
SKIP_MSG = re.compile(r"(?i)^(merge\b|wip\b|bump\b|release\b|v?\d+\.\d+(\.\d+)?\b)")


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args],
                          capture_output=True, text=True).stdout


def git_bytes(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args],
                          capture_output=True).stdout


def build_pr_map(head):
    """commit_sha -> PR group id, derived from 'Merge pull request #N' merges."""
    pr_map = {}
    merges = git("log", "--merges", "--pretty=%H%x01%s", head).strip().splitlines()
    for line in merges:
        if "\x01" not in line:
            continue
        msha, subj = line.split("\x01", 1)
        m = re.search(r"Merge pull request #(\d+)", subj)
        if not m:
            continue
        pr = f"pr_{m.group(1)}"
        parents = git("rev-list", "--parents", "-n", "1", msha).split()
        if len(parents) < 3:
            continue
        p1, p2 = parents[1], parents[2]
        for c in git("rev-list", f"{p1}..{p2}").split():
            pr_map.setdefault(c, pr)
    return pr_map


def changed_lines(hunk_lines):
    return sum(1 for l in hunk_lines if (l.startswith("+") and not l.startswith("+++"))
               or (l.startswith("-") and not l.startswith("---")))


def split_hunks(patch):
    """Return (header_lines, [hunk_block_lines, ...]) for a single-file patch."""
    lines = patch.splitlines()
    head, hunks, cur = [], [], None
    for l in lines:
        if l.startswith("@@"):
            if cur is not None:
                hunks.append(cur)
            cur = [l]
        elif cur is None:
            head.append(l)
        else:
            cur.append(l)
    if cur is not None:
        hunks.append(cur)
    return head, hunks


def verify(patch_text, parent_text):
    """True if patch_text applies to a tree containing parent_text at the path."""
    m = re.search(r"^\+\+\+ b/(.+)$", patch_text, re.M)
    if not m:
        m2 = re.search(r"^\+\+\+ (.+)$", patch_text, re.M)
        path = m2.group(1) if m2 else "file"
    else:
        path = m.group(1)
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        if parent_text is not None:
            fp = td / path
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(parent_text)
        pf = td / "u.patch"
        pf.write_text(patch_text if patch_text.endswith("\n") else patch_text + "\n")
        r = subprocess.run(["git", "apply", "--check", "--recount", "-p1", "u.patch"],
                           cwd=str(td), capture_output=True, text=True)
        return r.returncode == 0, r.stderr.strip()


def chunk_indices(lines, cap):
    """Blank-line-aware chunk boundaries over `lines`; each chunk <= ~cap lines."""
    bounds, start = [], 0
    i = 0
    while i < len(lines):
        if i - start >= cap:
            # back up to the most recent blank line for a clean boundary
            cut = i
            j = i
            while j > start and lines[j].strip() != "":
                j -= 1
            if j > start:
                cut = j
            bounds.append((start, cut))
            start = cut
            i = cut
        i += 1
    bounds.append((start, len(lines)))
    return [b for b in bounds if b[1] > b[0]]


def new_whole_patch(path, content):
    lines = content.split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
        trailing = True
    else:
        trailing = False
    body = "".join("+" + l + "\n" for l in lines)
    if not trailing:
        body += "\\ No newline at end of file\n"
    n = len(lines)
    return (f"diff --git a/{path} b/{path}\n"
            f"new file mode 100644\nindex 0000000..1111111\n"
            f"--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{n} @@\n" + body)


def append_patch(path, prefix_lines, add_lines):
    if not prefix_lines:
        body = "".join("+" + l + "\n" for l in add_lines)
        return (f"diff --git a/{path} b/{path}\n"
                f"new file mode 100644\nindex 0000000..1111111\n"
                f"--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{len(add_lines)} @@\n" + body)
    a = len(prefix_lines)
    ctx = prefix_lines[-1]
    body = " " + ctx + "\n" + "".join("+" + l + "\n" for l in add_lines)
    return (f"diff --git a/{path} b/{path}\n"
            f"index 1111111..2222222 100644\n"
            f"--- a/{path}\n+++ b/{path}\n"
            f"@@ -{a},1 +{a},{1 + len(add_lines)} @@\n" + body)


def slug(path):
    return re.sub(r"[^a-zA-Z0-9]+", "_", path).strip("_")[:48]


def main():
    head = git("rev-parse", "HEAD").strip()
    pr_map = build_pr_map(head)
    commits = git("rev-list", "--no-merges", "--reverse", head).split()

    units = []
    dropped = {"monsters": [], "filtered_files": [], "skipped_commits": [],
               "verify_failures": []}
    seen_diff = set()

    for sha in commits:
        subj = git("log", "-1", "--pretty=%s", sha).strip()
        if SKIP_MSG.match(subj) or len(subj.split()) <= 1:
            dropped["skipped_commits"].append({"sha": sha[:8], "subj": subj})
            continue
        parent = git("rev-parse", f"{sha}^").strip()
        group = pr_map.get(sha, f"c_{sha[:8]}")
        ns = git("diff-tree", "--no-commit-id", "--name-status", "-r",
                 "--no-renames", sha).strip().splitlines()
        for entry in ns:
            parts = entry.split("\t")
            if len(parts) < 2:
                continue
            status, path = parts[0], parts[1]
            ext = os.path.splitext(path)[1]
            if status not in ("A", "M") or ext not in INCLUDE_EXT or EXCLUDE_PATH.search(path):
                if ext in INCLUDE_EXT and status in ("A", "M"):
                    dropped["filtered_files"].append({"sha": sha[:8], "path": path})
                continue
            patch = git("diff", "--no-color", "--no-ext-diff", "--no-renames",
                        parent, sha, "--", path)
            if not patch.strip():
                continue

            emitted = []   # (suffix, patch_text, parent_text, n_changed, kind)

            if status == "A":
                content = git_bytes("show", f"{sha}:{path}").decode("utf-8", "replace")
                nlines = content.count("\n") + (0 if content.endswith("\n") else 1)
                if nlines <= NEW_WHOLE:
                    emitted.append(("0", patch, None, nlines, "new_whole"))
                else:
                    raw = content.split("\n")
                    if raw and raw[-1] == "":
                        raw = raw[:-1]
                    bounds = chunk_indices(raw, CHUNK_MAX)
                    prefix = []
                    for k, (a, b) in enumerate(bounds):
                        add = raw[a:b]
                        pt = append_patch(path, prefix, add)
                        parent_text = ("\n".join(prefix) + "\n") if prefix else None
                        emitted.append((str(k), pt, parent_text, len(add), "new_chunk"))
                        prefix = prefix + add
            else:  # modified
                parent_text = git_bytes("show", f"{parent}:{path}").decode("utf-8", "replace")
                head_lines, hunks = split_hunks(patch)
                kept = []
                for h in hunks:
                    ch = changed_lines(h)
                    if ch > MONSTER:
                        dropped["monsters"].append(
                            {"sha": sha[:8], "path": path, "changed": ch})
                    else:
                        kept.append((h, ch))
                if not kept:
                    continue
                total = sum(c for _, c in kept)
                if total <= SMALL_WHOLE:
                    body = "\n".join(head_lines + [l for h, _ in kept for l in h])
                    emitted.append(("0", body + "\n", parent_text, total, "mod_whole"))
                else:
                    for i, (h, c) in enumerate(kept):
                        body = "\n".join(head_lines + h)
                        emitted.append((str(i), body + "\n", parent_text, c, "mod_hunk"))

            for suffix, ptext, parent_text, nch, kind in emitted:
                ok, err = verify(ptext, parent_text)
                if not ok:
                    dropped["verify_failures"].append(
                        {"sha": sha[:8], "path": path, "kind": kind, "err": err[:160]})
                    continue
                red, findings = lib_secrets.redact(ptext)
                key = (path, red)
                if key in seen_diff:
                    continue
                seen_diff.add(key)
                uid = f"{sha[:8]}_{slug(path)}_{suffix}"
                units.append({
                    "id": uid, "commit": sha, "parent": parent, "group": group,
                    "file": path, "lang": ext.lstrip("."), "status": status,
                    "kind": kind, "n_changed": nch, "diff": red,
                    "redactions": findings, "subj": subj,
                })

    with open(OUT / "real_units.jsonl", "w") as f:
        for u in units:
            f.write(json.dumps(u, ensure_ascii=True) + "\n")
    with open(OUT / "real_dropped.json", "w") as f:
        json.dump(dropped, f, indent=2)
    meta = {
        "head": head, "n_units": len(units),
        "n_commits_scanned": len(commits),
        "n_skipped_commits": len(dropped["skipped_commits"]),
        "n_monsters": len(dropped["monsters"]),
        "n_verify_failures": len(dropped["verify_failures"]),
        "knobs": {"SMALL_WHOLE": SMALL_WHOLE, "NEW_WHOLE": NEW_WHOLE,
                  "MONSTER": MONSTER, "CHUNK_MAX": CHUNK_MAX},
        "include_ext": sorted(INCLUDE_EXT),
        "groups": len({u["group"] for u in units}),
    }
    with open(OUT / "extract_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps(meta, indent=2))
    by_lang = {}
    for u in units:
        by_lang[u["lang"]] = by_lang.get(u["lang"], 0) + 1
    print("by_lang:", by_lang)
    print("verify_failures:", len(dropped["verify_failures"]),
          "monsters:", len(dropped["monsters"]))


if __name__ == "__main__":
    sys.exit(main())
