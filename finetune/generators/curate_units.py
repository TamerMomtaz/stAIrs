"""
curate_units.py — Phase 1 curation.

Drops low-signal fragments that would produce vague or templated instructions:
  - pure wiring/mount (main.py router includes, middleware registration)
  - route/nav registration & import-only diffs (App/StairsApp tab wiring)
  - lone env / config stubs
  - trivially small changes (fewer than MIN_SUBSTANTIVE substantive lines)

A "substantive" changed line is an added/removed line that is not blank, not a
comment, not an import, and not pure punctuation/bracketing. Units that survive
have real logic to describe.

In : finetune/out/real_units.jsonl
Out: finetune/out/curated_units.jsonl, finetune/out/curate_dropped.json
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "finetune" / "out"

MIN_SUBSTANTIVE = 4

IMPORT_RE = re.compile(
    r"^(import|from|export\s+\{|export\s+\*|const\s+\w+\s*=\s*require|require\()"
)
WIRING_RE = re.compile(
    r"(include_router|add_middleware|app\.(include|add|mount|router)|"
    r"register_router|\.use\(|createRoot|ReactDOM)"
)
COMMENT_RE = re.compile(r"^(#|//|/\*|\*|--|\*/)")
PUNCT_ONLY_RE = re.compile(r"^[\s{}()\[\];,.:+\-=<>/\\|&]*$")


def substantive_lines(diff):
    out = []
    for raw in diff.splitlines():
        if raw.startswith(("+++", "---", "@@", "diff ", "index ", "new file",
                           "deleted file", "\\ No newline")):
            continue
        if not (raw.startswith("+") or raw.startswith("-")):
            continue
        body = raw[1:].strip()
        if not body or len(body) <= 1:
            continue
        if COMMENT_RE.match(body) or IMPORT_RE.match(body) or PUNCT_ONLY_RE.match(body):
            continue
        out.append(body)
    return out


def is_pure_wiring(unit, subs):
    f = unit["file"]
    if f.endswith("main.py"):
        # every substantive line is a router/middleware wiring call
        if subs and all(WIRING_RE.search(s) for s in subs):
            return True
    if re.search(r"(App|StairsApp|main)\.jsx$", f):
        # small JSX change that is only tab/route/nav wiring
        if len(subs) < 6 and all(
            WIRING_RE.search(s) or re.match(r"^<|/>$|^\{|key=|to=|path=|label[:=]", s)
            for s in subs
        ):
            return True
    return False


def main():
    units = [json.loads(l) for l in (OUT / "real_units.jsonl").read_text().splitlines() if l.strip()]
    kept, dropped = [], []
    reasons = {}
    for u in units:
        subs = substantive_lines(u["diff"])
        reason = None
        if len(subs) < MIN_SUBSTANTIVE:
            reason = "trivial"
        elif is_pure_wiring(u, subs):
            reason = "wiring_mount"
        if reason:
            dropped.append({"id": u["id"], "file": u["file"], "reason": reason,
                            "n_sub": len(subs)})
            reasons[reason] = reasons.get(reason, 0) + 1
        else:
            u["n_substantive"] = len(subs)
            kept.append(u)

    with open(OUT / "curated_units.jsonl", "w") as f:
        for u in kept:
            f.write(json.dumps(u, ensure_ascii=True) + "\n")
    with open(OUT / "curate_dropped.json", "w") as f:
        json.dump({"dropped": dropped, "reasons": reasons}, f, indent=2)

    by_lang = {}
    for u in kept:
        by_lang[u["lang"]] = by_lang.get(u["lang"], 0) + 1
    print(f"in={len(units)} kept={len(kept)} dropped={len(dropped)} reasons={reasons}")
    print("by_lang:", by_lang)
    print("groups:", len({u["group"] for u in kept}))


if __name__ == "__main__":
    main()
