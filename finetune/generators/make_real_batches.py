"""
make_real_batches.py — split curated units into batch files for the fan-out.

Each batch file is handed to one general-purpose subagent, which authors ONE
forward-looking instruction per unit (grounded in the diff's real symbols) and
writes real_out_<NN>.json = [{id, instruction}] back to the same dir.

Env:
  BATCH_DIR   where batch files are written (default: scratch/real_batches)
  BATCH_SIZE  units per batch (default: 14)

Determinism: seed 20240624 shuffle so each batch mixes languages/files.
"""

import json
import os
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "finetune" / "out"
SEED = 20240624
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "14"))
BATCH_DIR = Path(os.environ.get("BATCH_DIR", "/tmp/claude-0/-home-user-stAIrs/"
                 "060e05c5-6952-516a-93a1-569ab61deac7/scratchpad/real_batches"))


def main():
    BATCH_DIR.mkdir(parents=True, exist_ok=True)
    units = [json.loads(l) for l in (OUT / "curated_units.jsonl").read_text().splitlines() if l.strip()]
    rng = random.Random(SEED)
    rng.shuffle(units)

    batches = [units[i:i + BATCH_SIZE] for i in range(0, len(units), BATCH_SIZE)]
    for n, batch in enumerate(batches, 1):
        payload = {
            "batch": n,
            "count": len(batch),
            "units": [{"id": u["id"], "file": u["file"], "lang": u["lang"],
                       "status": u["status"], "diff": u["diff"]} for u in batch],
        }
        (BATCH_DIR / f"real_batch_{n:02d}.json").write_text(
            json.dumps(payload, ensure_ascii=True, indent=1))
    print(f"units={len(units)} batches={len(batches)} size={BATCH_SIZE} dir={BATCH_DIR}")


if __name__ == "__main__":
    main()
