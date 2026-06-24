"""
verify_synth.py — compile-verify the FULL synthetic set.

Reads every synth_out_*.json from SYNTH_OUT, writes each record's code to a temp
file with the right extension, and runs the language's verifier:
  py  -> python -m py_compile  +  ruff check --select E9,F
  sql -> sqlfluff parse --dialect postgres
  jsx -> esbuild <f> --log-level=error

Emits the passing set and a failure manifest (with errors) so failures can be
re-authored and re-verified. Reports full-set and >=10%-sample pass rates.

Env:
  SYNTH_OUT   dir with synth_out_*.json (default: scratch/synth_out)
Out:
  finetune/out/synth_verified.jsonl
  finetune/out/synth_verify_report.json
"""

import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "finetune" / "out"
SYNTH_OUT = Path(os.environ.get("SYNTH_OUT", "/tmp/claude-0/-home-user-stAIrs/"
                 "060e05c5-6952-516a-93a1-569ab61deac7/scratchpad/synth_out"))
ESBUILD = Path("/tmp/claude-0/-home-user-stAIrs/"
               "060e05c5-6952-516a-93a1-569ab61deac7/scratchpad/esbuild_path.txt")
ESBUILD_BIN = ESBUILD.read_text().strip() if ESBUILD.exists() else "esbuild"

FENCE = re.compile(r"^```[a-zA-Z]*\n|\n```\s*$")


def strip_fences(code):
    c = code
    if c.lstrip().startswith("```"):
        c = re.sub(r"^\s*```[a-zA-Z]*\n", "", c, count=1)
        c = re.sub(r"\n```\s*$", "\n", c, count=1)
    return c


def check_py(path):
    r = subprocess.run(["python3", "-m", "py_compile", path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return False, "py_compile: " + r.stderr.strip().splitlines()[-1][:200]
    r2 = subprocess.run(["ruff", "check", "--select", "E9,F", "--no-cache", path],
                        capture_output=True, text=True)
    if r2.returncode != 0:
        msg = (r2.stdout + r2.stderr).strip().splitlines()
        first = next((l for l in msg if ".py:" in l), msg[0] if msg else "ruff error")
        return False, "ruff: " + first[:200]
    return True, ""


def check_sql(path):
    r = subprocess.run(["sqlfluff", "parse", "--dialect", "postgres", path],
                       capture_output=True, text=True)
    out = r.stdout + r.stderr
    if r.returncode != 0 or "Unparsable" in out or "PRS" in out:
        line = next((l for l in out.splitlines() if "PRS" in l or "Unparsable" in l),
                    out.strip().splitlines()[-1] if out.strip() else "parse error")
        return False, "sqlfluff: " + line[:200]
    return True, ""


def check_jsx(path):
    r = subprocess.run([ESBUILD_BIN, path, "--log-level=error"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return False, "esbuild: " + r.stderr.strip().splitlines()[0][:200] if r.stderr.strip() else "esbuild error"
    return True, ""


CHECKERS = {"py": check_py, "sql": check_sql, "jsx": check_jsx}


def verify_one(rec, tmpdir):
    lang = rec["lang"]
    code = strip_fences(rec["code"])
    ext = lang
    fp = Path(tmpdir) / f"{rec['cell_id']}.{ext}"
    fp.write_text(code)
    ok, err = CHECKERS[lang](str(fp))
    rec = dict(rec, code=code)
    return rec, ok, err


def main():
    records, seen = [], set()
    for fp in sorted(SYNTH_OUT.glob("synth_out_*.json")):
        try:
            data = json.loads(fp.read_text())
        except json.JSONDecodeError as e:
            print(f"WARN: {fp.name} not valid JSON: {e}")
            continue
        for rec in data:
            cid = rec.get("cell_id")
            if not cid or cid in seen:
                continue
            if not all(k in rec for k in ("instruction", "file", "lang", "code")):
                continue
            seen.add(cid)
            records.append(rec)

    results = []
    with tempfile.TemporaryDirectory() as td:
        with ThreadPoolExecutor(max_workers=12) as ex:
            results = list(ex.map(lambda rec: verify_one(rec, td), records))

    passing = [rec for rec, ok, _ in results if ok]
    failures = [{"cell_id": rec["cell_id"], "lang": rec["lang"], "file": rec["file"],
                 "err": err} for rec, ok, err in results if not ok]

    with open(OUT / "synth_verified.jsonl", "w") as f:
        for rec in passing:
            f.write(json.dumps(rec, ensure_ascii=True) + "\n")
    by_lang_total, by_lang_pass = {}, {}
    for rec, ok, _ in results:
        by_lang_total[rec["lang"]] = by_lang_total.get(rec["lang"], 0) + 1
        if ok:
            by_lang_pass[rec["lang"]] = by_lang_pass.get(rec["lang"], 0) + 1
    n = len(results)
    rate = (len(passing) / n * 100) if n else 0
    report = {
        "total": n, "passing": len(passing), "failing": len(failures),
        "pass_rate_full_pct": round(rate, 2),
        "sample_10pct_note": "full set verified (100% coverage), not a sample",
        "by_lang_total": by_lang_total, "by_lang_pass": by_lang_pass,
        "failures": failures,
    }
    with open(OUT / "synth_verify_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"total={n} passing={len(passing)} failing={len(failures)} "
          f"rate={rate:.2f}%")
    print("by_lang_total:", by_lang_total, "by_lang_pass:", by_lang_pass)
    if failures:
        print("first failures:", json.dumps(failures[:8], indent=1))


if __name__ == "__main__":
    main()
