"""
merge_synth.py — assemble verified synthetic pairs.

Reads the verified synthetic set, redacts any secrets (placeholders/env-reads
are left alone), assigns a per-cell group id (synth splits by id), and reports
per-family coverage.

In : finetune/out/synth_verified.jsonl
Out: finetune/out/synth_pairs.jsonl, finetune/out/merge_synth_report.json
"""

import json
import re
from collections import Counter
from pathlib import Path

import lib_secrets

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "finetune" / "out"


def family_of(cell_id):
    return re.sub(r"_T?\d+$", "", cell_id)


def main():
    recs = [json.loads(l) for l in (OUT / "synth_verified.jsonl").read_text().splitlines() if l.strip()]
    pairs, redactions = [], 0
    fam_counts = Counter()
    for r in recs:
        red, findings = lib_secrets.redact(r["code"])
        redactions += len(findings)
        fam = r.get("family") or family_of(r["cell_id"])
        fam_counts[fam] += 1
        pairs.append({
            "id": r["cell_id"], "file": r["file"], "lang": r["lang"],
            "family": fam, "entity": r.get("entity", ""),
            "group": f"synth_{r['cell_id']}", "source": "synth",
            "instruction": r["instruction"].strip(), "assistant": red,
            "redactions": findings,
        })

    with open(OUT / "synth_pairs.jsonl", "w") as f:
        for p in pairs:
            f.write(json.dumps(p, ensure_ascii=True) + "\n")

    report = {
        "verified_in": len(recs), "pairs_out": len(pairs),
        "redactions": redactions,
        "families": len(fam_counts), "by_family": dict(fam_counts),
        "by_lang": dict(Counter(p["lang"] for p in pairs)),
    }
    with open(OUT / "merge_synth_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"verified_in={len(recs)} pairs_out={len(pairs)} redactions={redactions} "
          f"families={len(fam_counts)}")
    print("by_lang:", report["by_lang"])


if __name__ == "__main__":
    main()
