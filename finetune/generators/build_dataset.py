"""
build_dataset.py — assemble the final, uploadable dataset.

Steps:
  1. load real_pairs + synth_pairs
  2. exact dedup (sha256 of normalized assistant) then MinHash near-dup
     (Jaccard >= 0.9). Real always wins.
  3. per-family cap (<= 5% of total) + round-robin trim synth to TARGET_SYNTH
  4. assemble each pair into ONE consistent system msg + user (instruction +
     format suffix, file named in backticks) + assistant (single fenced block:
     ```diff for real, ```<lang> for synth). ASCII (ensure_ascii), LF, one
     trailing \\n, token-guarded <= 16k (tiktoken o200k_base; approximate).
  5. group-based 95/5 split (real grouped by PR, synth by id) + seeded shuffle
  6. emit dist/{train,eval}.{anthropic,axolotl}.jsonl, smoke.{schema}.jsonl(50),
     index/pairs.index.jsonl, manifest.json, decisions/*, meta/*

Env: TARGET_SYNTH (default 4 * n_real). Determinism: seed 20240624.
"""

import hashlib
import json
import os
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

import tiktoken

ROOT = Path(__file__).resolve().parents[2]
FT = ROOT / "finetune"
OUT = FT / "out"
DIST = FT / "dist"
SEED = 20240624
NEAR = 0.9
TOKEN_CAP = 16000
SMOKE_N = 50

ENC = tiktoken.get_encoding("o200k_base")
FENCE_LANG = {"py": "python", "sql": "sql", "jsx": "jsx", "js": "javascript",
              "ts": "typescript", "tsx": "tsx", "css": "css"}

SYSTEM = (
    "You are a senior engineer on Stairs, a strategic-planning platform with a "
    "FastAPI + asyncpg + PostgreSQL backend and a React (Vite) frontend. "
    "Implement exactly what is requested for the single named file. Respond with "
    "only that file's change as one fenced code block and no prose: a unified diff "
    "in a ```diff block when editing an existing file, or the file's full contents "
    "in a single ```<language> block when creating a new file."
)


def norm(s):
    return re.sub(r"\s+", " ", s).strip()


def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


_SALTS = [hashlib.blake2b(str(i).encode(), digest_size=8).digest() for i in range(64)]


def minhash(text):
    toks = set(re.findall(r"\w+", text.lower()))
    if not toks:
        return tuple([0] * 64)
    sig = []
    for salt in _SALTS:
        m = min(int.from_bytes(hashlib.blake2b(t.encode(), digest_size=8, key=salt).digest(), "big")
                for t in toks)
        sig.append(m)
    return tuple(sig)


def est_jaccard(a, b):
    return sum(1 for x, y in zip(a, b) if x == y) / len(a)


def load(name):
    p = OUT / name
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def assemble(pair):
    instr = pair["instruction"].strip()
    if pair["source"] == "real":
        fence = "diff"
        suffix = "\n\nRespond with a single unified diff in one ```diff code block and nothing else."
        body = pair["assistant"]
    else:
        fence = FENCE_LANG.get(pair["lang"], "text")
        suffix = (f"\n\nRespond with the file's complete contents in one ```{fence} "
                  "code block and nothing else.")
        body = pair["assistant"]
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    if not body.endswith("\n"):
        body += "\n"
    assistant = f"```{fence}\n{body}```"
    user = instr + suffix
    return user, assistant


def n_tokens(system, user, assistant):
    return len(ENC.encode(system + "\n" + user + "\n" + assistant))


def main():
    DIST.mkdir(parents=True, exist_ok=True)
    (FT / "index").mkdir(exist_ok=True)
    (FT / "meta").mkdir(exist_ok=True)
    (FT / "decisions").mkdir(exist_ok=True)

    real = load("real_pairs.jsonl")
    synth = load("synth_pairs.jsonl")
    n_real = len(real)
    target_synth = int(os.environ.get("TARGET_SYNTH", str(4 * n_real)))

    # ── dedup: real first (always wins), then synth ──
    kept, kept_sigs = [], []
    exact_seen = {}
    dropped_exact = dropped_near = 0
    near_examples = []

    def consider(p, is_real):
        nonlocal dropped_exact, dropped_near
        h = sha(norm(p["assistant"]))
        if h in exact_seen:
            dropped_exact += 1
            return
        sig = minhash(p["assistant"])
        for ks, kp in zip(kept_sigs, kept):
            if est_jaccard(sig, ks) >= NEAR:
                dropped_near += 1
                if len(near_examples) < 30:
                    near_examples.append({"dropped": p["id"], "kept": kp["id"]})
                return
        exact_seen[h] = p["id"]
        kept.append(p)
        kept_sigs.append(sig)

    for p in real:
        consider(p, True)
    for p in synth:
        consider(p, False)

    kept_real = [p for p in kept if p["source"] == "real"]
    kept_synth = [p for p in kept if p["source"] == "synth"]

    # ── per-family cap (<=5% of projected total) + round-robin trim to target ──
    total_proj = len(kept_real) + min(len(kept_synth), target_synth)
    cap = max(1, int(0.05 * total_proj))
    by_fam = defaultdict(list)
    for p in kept_synth:
        by_fam[p["family"]].append(p)
    capped = []
    for fam, items in by_fam.items():
        capped.extend(items[:cap])
    capped_dropped = len(kept_synth) - len(capped)

    # round-robin trim to exactly target_synth (remove from largest families first)
    synth_final = capped
    rr_trimmed = 0
    if len(synth_final) > target_synth:
        groups = defaultdict(list)
        for p in synth_final:
            groups[p["family"]].append(p)
        order = sorted(groups, key=lambda f: -len(groups[f]))
        need = len(synth_final) - target_synth
        while need > 0:
            progressed = False
            for fam in order:
                if need == 0:
                    break
                if len(groups[fam]) > 1:
                    groups[fam].pop()
                    need -= 1
                    rr_trimmed += 1
                    progressed = True
            if not progressed:
                break
        synth_final = [p for fam in groups for p in groups[fam]]

    final = kept_real + synth_final

    # ── assemble + token guard ──
    records = []
    over = 0
    for p in final:
        user, assistant = assemble(p)
        nt = n_tokens(SYSTEM, user, assistant)
        if nt > TOKEN_CAP:
            over += 1
            continue
        records.append({**p, "_user": user, "_assistant": assistant, "_ntok": nt})

    rec_real = [r for r in records if r["source"] == "real"]
    rec_synth = [r for r in records if r["source"] == "synth"]

    # ── group-based 95/5 split per source (whole groups -> no leakage) ──
    import random
    rng = random.Random(SEED)

    def split(recs):
        groups = defaultdict(list)
        for r in recs:
            groups[r["group"]].append(r)
        gids = list(groups)
        rng.shuffle(gids)
        n_eval_target = max(1, round(0.05 * len(recs)))
        eval_set, n_eval = [], 0
        for g in gids:
            if n_eval < n_eval_target:
                eval_set.append(g)
                n_eval += len(groups[g])
        eval_ids = set(eval_set)
        train = [r for g in gids if g not in eval_ids for r in groups[g]]
        ev = [r for g in eval_set for r in groups[g]]
        return train, ev

    tr_real, ev_real = split(rec_real)
    tr_syn, ev_syn = split(rec_synth)
    train = tr_real + tr_syn
    ev = ev_real + ev_syn
    rng.shuffle(train)
    rng.shuffle(ev)

    # ── emit dual-schema files ──
    def anthropic(r):
        return {"system": SYSTEM,
                "messages": [{"role": "user", "content": r["_user"]},
                             {"role": "assistant", "content": r["_assistant"]}]}

    def axolotl(r):
        return {"messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": r["_user"]},
                             {"role": "assistant", "content": r["_assistant"]}]}

    def write_jsonl(path, rows):
        with open(path, "w", newline="\n") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=True) + "\n")

    emitted = {}
    for schema, fn in (("anthropic", anthropic), ("axolotl", axolotl)):
        tp = DIST / f"train.{schema}.jsonl"
        ep = DIST / f"eval.{schema}.jsonl"
        write_jsonl(tp, [fn(r) for r in train])
        write_jsonl(ep, [fn(r) for r in ev])
        emitted[tp.name] = tp
        emitted[ep.name] = ep
        # smoke = balanced 50 from train (deterministic)
        smoke_rows = (train[:SMOKE_N])
        sp = FT / f"smoke.{schema}.jsonl"
        write_jsonl(sp, [fn(r) for r in smoke_rows])
        emitted[sp.name] = sp

    # ── index ──
    idx_path = FT / "index" / "pairs.index.jsonl"
    split_of = {id(r): "train" for r in train}
    split_of.update({id(r): "eval" for r in ev})
    with open(idx_path, "w", newline="\n") as f:
        for r in train + ev:
            f.write(json.dumps({
                "id": r["id"], "source": r["source"], "file": r["file"],
                "lang": r["lang"], "group": r["group"],
                "family": r.get("family", ""), "split": split_of[id(r)],
                "n_tokens": r["_ntok"], "assistant_sha256": sha(r["_assistant"]),
            }, ensure_ascii=True) + "\n")
    emitted[idx_path.name] = idx_path

    # ── stats ──
    toks = [r["_ntok"] for r in records]
    toks_sorted = sorted(toks)
    def pct(p):
        return toks_sorted[min(len(toks_sorted) - 1, int(p * len(toks_sorted)))]
    total = len(records)
    synth_pct = round(100 * len(rec_synth) / total, 1) if total else 0

    manifest = {
        "dataset": "stairs-instruct-v1",
        "seed": SEED,
        "head": json.loads((OUT / "extract_meta.json").read_text())["head"],
        "tokenizer": "tiktoken o200k_base (Anthropic has no offline tokenizer; "
                     "sizes are APPROXIMATE; all records are far under the 16k cap)",
        "counts": {
            "real": len(rec_real), "synth": len(rec_synth), "total": total,
            "target_synth": target_synth, "n_real_curated": n_real,
        },
        "mix": {"real_pct": round(100 * len(rec_real) / total, 1) if total else 0,
                "synth_pct": synth_pct},
        "synthetic_over_70pct_FLAG": synth_pct > 70,
        "dedup": {"exact_removed": dropped_exact, "near_removed": dropped_near,
                  "near_threshold_jaccard": NEAR,
                  "family_cap_removed": capped_dropped, "round_robin_trimmed": rr_trimmed,
                  "near_examples": near_examples[:15]},
        "token_guard": {"cap": TOKEN_CAP, "over_cap_dropped": over,
                        "min": toks_sorted[0] if toks else 0,
                        "p50": pct(0.5), "p95": pct(0.95),
                        "max": toks_sorted[-1] if toks else 0},
        "split": {"strategy": "group-based 95/5 (real grouped by PR, synth by id)",
                  "train": len(train), "eval": len(ev),
                  "train_real": len(tr_real), "eval_real": len(ev_real),
                  "train_synth": len(tr_syn), "eval_synth": len(ev_syn)},
        "histograms": {
            "by_source": dict(Counter(r["source"] for r in records)),
            "by_lang": dict(Counter(r["lang"] for r in records)),
            "by_family": dict(Counter(r.get("family", "real") for r in records)),
        },
        "schemas": {
            "anthropic": "{\"system\":..,\"messages\":[user,assistant]}",
            "axolotl": "{\"messages\":[system,user,assistant]}",
            "note": "SAME pairs, two wrappers. Upload ONE schema per job.",
        },
        "files": {},
    }
    for name, path in sorted(emitted.items()):
        manifest["files"][name] = {
            "sha256": file_sha(path),
            "bytes": path.stat().st_size,
            "lines": sum(1 for _ in open(path)),
            "gitignored": name.startswith(("train.", "eval.")),
        }

    (FT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    decisions = {
        "dual_schemas": ["anthropic", "axolotl"],
        "size_policy": "synthetic ~= 4x real (aggressive)",
        "determinism": {"seed": SEED, "near_dup_jaccard": NEAR,
                        "split": "95/5 group-based, no source leakage"},
        "record_format": "one system msg; user names file in backticks; assistant "
                         "is a single fenced block (```diff real / ```lang synth); "
                         "ASCII; LF; one trailing newline; <=16k tokens",
        "tokenizer": "tiktoken o200k_base (approximate sizing)",
        "flag": {"synthetic_over_70pct_FLAG": synth_pct > 70, "synth_pct": synth_pct},
    }
    (FT / "decisions" / "decisions.json").write_text(json.dumps(decisions, indent=2) + "\n")

    tools = {}
    for cmd, key in ((["python3", "--version"], "python"),
                     (["ruff", "--version"], "ruff"),
                     (["sqlfluff", "--version"], "sqlfluff"),
                     (["jq", "--version"], "jq"),
                     (["node", "--version"], "node")):
        try:
            tools[key] = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
        except Exception as e:
            tools[key] = f"err:{e}"
    tools["tiktoken_encoding"] = "o200k_base"
    (FT / "meta" / "toolchain.json").write_text(json.dumps(tools, indent=2) + "\n")

    print(f"real={len(rec_real)} synth={len(rec_synth)} total={total} "
          f"synth_pct={synth_pct}% FLAG={synth_pct > 70}")
    print(f"dedup: exact={dropped_exact} near={dropped_near} "
          f"family_cap={capped_dropped} rr_trim={rr_trimmed} over_token={over}")
    print(f"split: train={len(train)} eval={len(ev)} "
          f"(real {len(tr_real)}/{len(ev_real)}, synth {len(tr_syn)}/{len(ev_syn)})")
    print(f"tokens: p50={pct(0.5)} p95={pct(0.95)} max={toks_sorted[-1] if toks else 0}")
    print("manifest + dist written")


if __name__ == "__main__":
    main()
