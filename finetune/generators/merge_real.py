"""
merge_real.py — strict merge of authored instructions back onto curated units.

Reads every real_out_<NN>.json from BATCH_DIR and joins on unit id. STRICT:
every curated id must have exactly one instruction; reports missing / duplicate /
orphan ids and emits quality warnings (no backticked filename, references to
commits/PRs/diffs, near-duplicate/templated instructions).

In : finetune/out/curated_units.jsonl, $BATCH_DIR/real_out_*.json
Out: finetune/out/real_pairs.jsonl, finetune/out/merge_real_report.json
"""

import json
import os
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "finetune" / "out"
BATCH_DIR = Path(os.environ.get("BATCH_DIR", "/tmp/claude-0/-home-user-stAIrs/"
                 "060e05c5-6952-516a-93a1-569ab61deac7/scratchpad/real_batches"))

BAD_REF = re.compile(r"(?i)\b(this (commit|diff|change|patch|pr)|the (commit|diff|patch|above)|"
                     r"pull request|\bPR\b|as shown|in the diff)\b")


def norm(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).split()


def jaccard(a, b):
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def main():
    units = {json.loads(l)["id"]: json.loads(l)
             for l in (OUT / "curated_units.jsonl").read_text().splitlines() if l.strip()}

    instr = {}
    dups, orphans = [], []
    for fp in sorted(BATCH_DIR.glob("real_out_*.json")):
        for rec in json.loads(fp.read_text()):
            rid, text = rec.get("id"), (rec.get("instruction") or "").strip()
            if rid not in units:
                orphans.append({"id": rid, "src": fp.name})
                continue
            if rid in instr:
                dups.append({"id": rid, "src": fp.name})
                continue
            instr[rid] = text

    missing = [uid for uid in units if uid not in instr]

    warnings = []
    for uid, text in instr.items():
        base = os.path.basename(units[uid]["file"])
        if f"`{base}`" not in text and base not in text:
            warnings.append({"id": uid, "w": "no_backtick_filename"})
        if BAD_REF.search(text):
            warnings.append({"id": uid, "w": "references_commit_or_diff"})
        if len(text) < 20:
            warnings.append({"id": uid, "w": "too_short"})

    # near-duplicate / templated detection across instructions
    toks = {uid: norm(t) for uid, t in instr.items()}
    ids = list(toks)
    near = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            if jaccard(toks[ids[i]], toks[ids[j]]) >= 0.8:
                near.append([ids[i], ids[j]])

    pairs = []
    for uid, u in units.items():
        if uid in instr:
            pairs.append({
                "id": uid, "file": u["file"], "lang": u["lang"], "status": u["status"],
                "group": u["group"], "source": "real",
                "instruction": instr[uid], "assistant": u["diff"],
            })

    with open(OUT / "real_pairs.jsonl", "w") as f:
        for p in pairs:
            f.write(json.dumps(p, ensure_ascii=True) + "\n")

    report = {
        "curated": len(units), "instructions": len(instr), "pairs": len(pairs),
        "missing": missing, "duplicates": dups, "orphans": orphans,
        "warning_counts": dict(Counter(w["w"] for w in warnings)),
        "warnings": warnings[:50], "near_duplicates": near[:50],
        "n_near_duplicates": len(near),
        "strict_ok": not missing and not dups and not orphans,
    }
    with open(OUT / "merge_real_report.json", "w") as f:
        json.dump(report, f, indent=2)

    print(f"curated={len(units)} instructions={len(instr)} pairs={len(pairs)}")
    print(f"missing={len(missing)} dups={len(dups)} orphans={len(orphans)} "
          f"near_dup={len(near)} warnings={report['warning_counts']}")
    print("STRICT_OK" if report["strict_ok"] else "STRICT_FAIL: re-author gaps")


if __name__ == "__main__":
    main()
