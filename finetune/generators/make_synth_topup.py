"""
make_synth_topup.py — recover dedup losses by topping up ENTITY families only.

Generic-utility families saturate (a finite number of structurally-distinct
rate limiters / retry decorators exist), so most dedup losses land there. We do
NOT pad them with near-duplicates. Instead we add cells to the 21 entity
families with entity/axis offsets so the new cells stay distinct from round 1.

Env:
  ASSIGN_DIR          output dir (default: scratch/assignments)
  TOPUP_PER_FAMILY    cells per entity family (default: 12)

Importing make_synth_assignments does NOT write files (its writes are guarded by
__main__), so this is safe.
"""

import json
import os
from pathlib import Path

import make_synth_assignments as base

DEFAULT_ASSIGN_DIR = base.DEFAULT_ASSIGN_DIR
OFFSET = 11  # coprime-ish shift so topup entities differ from round 1


def main():
    assign_dir = Path(os.environ.get("ASSIGN_DIR", DEFAULT_ASSIGN_DIR))
    per_family = int(os.environ.get("TOPUP_PER_FAMILY", "12"))
    assign_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    n = 0
    for fi, (fam, lang, generic, axes, purpose) in enumerate(base.FAMILIES):
        if generic:
            continue
        n += 1
        cells = []
        for ci in range(per_family):
            entity, fields = base.ENTITIES[(fi + ci + OFFSET) % len(base.ENTITIES)]
            realized = {ax: base.pick(ax, fi * 13 + ci * 5 + i + OFFSET)
                        for i, ax in enumerate(axes)}
            cells.append({
                "cell_id": f"{fam}_T{ci:02d}",
                "family": fam, "lang": lang, "is_generic": False,
                "purpose": purpose,
                "entity": entity, "entity_fields": fields,
                "axes": realized,
                "file": base.file_for(fam, lang, entity, 90 + ci),
            })
        data = {"family": fam, "lang": lang, "is_generic": False,
                "purpose": purpose, "varies_axes": axes, "count": len(cells),
                "cells": cells, "vocab": base.VOCAB}
        (assign_dir / f"assign_T{n:02d}_{fam}.json").write_text(
            json.dumps(data, ensure_ascii=True, indent=1))
        total += len(cells)
    print(f"topup_files={n} topup_cells={total} per_family={per_family} dir={assign_dir}")


if __name__ == "__main__":
    main()
