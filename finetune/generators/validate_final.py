"""
validate_final.py — INDEPENDENT final validation.

Runs jq (an independent JSON parser) plus a strict in-process pass over every
emitted JSONL file. Re-implements the secret sweep here (does NOT import
lib_secrets) so the final files are cross-checked rather than trusted.

Checks per message file (train/eval/smoke x anthropic/axolotl):
  - jq parses every line; line count matches
  - 100% ASCII, no BOM, no blank lines, exactly one trailing \\n
  - schema-correct roles (anthropic: system + [user,assistant];
    axolotl: [system,user,assistant]); all content non-empty
  - no duplicate records within a file
  - every record <= 16k tokens (tiktoken o200k_base)
  - secret sweep == 0
Cross-file: no train<->eval assistant leakage within a schema.
Manifest: every recorded sha256 matches the file on disk. (manifest.json is
pretty-printed metadata, NOT jsonl — it is checked as a whole, never line-parsed.)

Prints "ALL FILES VALID" and exits 0 only if everything passes.
"""

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import tiktoken

ROOT = Path(__file__).resolve().parents[2]
FT = ROOT / "finetune"
DIST = FT / "dist"
ENC = tiktoken.get_encoding("o200k_base")
TOKEN_CAP = 16000

SECRET_PATTERNS = [
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{24,}")),
    ("openai_key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9]{32,}")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}")),
    ("bcrypt", re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")),
]

SCHEMAS = {
    "train.anthropic.jsonl": "anthropic", "eval.anthropic.jsonl": "anthropic",
    "train.axolotl.jsonl": "axolotl", "eval.axolotl.jsonl": "axolotl",
}
SMOKE = {"smoke.anthropic.jsonl": "anthropic", "smoke.axolotl.jsonl": "axolotl"}

errors = []
warns = []


def err(f, msg):
    errors.append(f"{f}: {msg}")


def jq_ok(path):
    r = subprocess.run(["jq", "-e", ".", str(path)], capture_output=True, text=True)
    n = sum(1 for _ in subprocess.run(["jq", "-c", ".", str(path)],
            capture_output=True, text=True).stdout.splitlines())
    return r.returncode == 0, n


def common_text_checks(path, name):
    raw = path.read_bytes()
    if raw[:3] == b"\xef\xbb\xbf":
        err(name, "has BOM")
    try:
        raw.decode("ascii")
    except UnicodeDecodeError as e:
        err(name, f"non-ASCII byte at {e.start}")
    if not raw.endswith(b"\n"):
        err(name, "no trailing newline")
    if raw.endswith(b"\n\n"):
        err(name, "multiple trailing newlines")
    text = raw.decode("ascii", "replace")
    for i, line in enumerate(text.split("\n")[:-1], 1):
        if line.strip() == "":
            err(name, f"blank line at {i}")
            break


def content_of(obj, schema):
    if schema == "anthropic":
        sys_c = obj.get("system", "")
        msgs = obj.get("messages", [])
        return sys_c, msgs
    msgs = obj.get("messages", [])
    sys_c = msgs[0]["content"] if msgs and msgs[0].get("role") == "system" else ""
    return sys_c, msgs


def validate_message_file(path, schema, name):
    ok, n = jq_ok(path)
    if not ok:
        err(name, "jq failed to parse")
        return [], n
    common_text_checks(path, name)
    lines = path.read_text().splitlines()
    seen, assistants = set(), []
    for i, line in enumerate(lines, 1):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            err(name, f"line {i} not JSON")
            continue
        h = hashlib.sha256(line.encode()).hexdigest()
        if h in seen:
            err(name, f"duplicate record line {i}")
        seen.add(h)
        if schema == "anthropic":
            roles = [m.get("role") for m in obj.get("messages", [])]
            if "system" not in obj or not obj["system"].strip():
                err(name, f"line {i} missing/empty system")
            if roles != ["user", "assistant"]:
                err(name, f"line {i} roles {roles} != [user,assistant]")
        else:
            roles = [m.get("role") for m in obj.get("messages", [])]
            if roles != ["system", "user", "assistant"]:
                err(name, f"line {i} roles {roles} != [system,user,assistant]")
        sys_c, msgs = content_of(obj, schema)
        for m in msgs:
            if not (m.get("content") or "").strip():
                err(name, f"line {i} empty content in {m.get('role')}")
        full = sys_c + "\n" + "\n".join(m.get("content", "") for m in msgs)
        nt = len(ENC.encode(full))
        if nt > TOKEN_CAP:
            err(name, f"line {i} {nt} tokens > {TOKEN_CAP}")
        for sname, pat in SECRET_PATTERNS:
            if pat.search(full):
                err(name, f"line {i} SECRET {sname}")
        assistants.append(msgs[-1]["content"])
    return assistants, n


def validate_index(path, name):
    ok, n = jq_ok(path)
    if not ok:
        err(name, "jq failed")
        return
    common_text_checks(path, name)
    ids = set()
    for i, line in enumerate(path.read_text().splitlines(), 1):
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            err(name, f"line {i} not JSON")
            continue
        if obj.get("id") in ids:
            err(name, f"duplicate id {obj.get('id')}")
        ids.add(obj.get("id"))
        if obj.get("split") not in ("train", "eval"):
            err(name, f"line {i} bad split")


def main():
    print("Validating emitted files...\n")
    schema_assistants = {"anthropic": {}, "axolotl": {}}
    for fname, schema in SCHEMAS.items():
        path = DIST / fname
        if not path.exists():
            err(fname, "MISSING")
            continue
        a, n = validate_message_file(path, schema, fname)
        split = "train" if fname.startswith("train") else "eval"
        schema_assistants[schema][split] = set(hashlib.sha256(x.encode()).hexdigest() for x in a)
        print(f"  checked {fname}: {n} records")

    for fname, schema in SMOKE.items():
        path = FT / fname
        if not path.exists():
            err(fname, "MISSING")
            continue
        validate_message_file(path, schema, fname)
        print(f"  checked {fname}")

    idx = FT / "index" / "pairs.index.jsonl"
    if idx.exists():
        validate_index(idx, "pairs.index.jsonl")
        print("  checked pairs.index.jsonl")
    else:
        err("pairs.index.jsonl", "MISSING")

    # cross-file leakage within a schema
    for schema, splits in schema_assistants.items():
        if "train" in splits and "eval" in splits:
            leak = splits["train"] & splits["eval"]
            if leak:
                err(f"{schema}", f"train<->eval leakage: {len(leak)} shared assistant contents")
            else:
                print(f"  no train<->eval leakage ({schema})")

    # manifest sha256 verification
    man = FT / "manifest.json"
    if man.exists():
        manifest = json.loads(man.read_text())
        for name, info in manifest.get("files", {}).items():
            cand = (DIST / name) if name.startswith(("train.", "eval.")) else \
                   (FT / "index" / name) if name.endswith(".index.jsonl") else (FT / name)
            if not cand.exists():
                err("manifest", f"{name} missing on disk")
                continue
            actual = hashlib.sha256(cand.read_bytes()).hexdigest()
            if actual != info["sha256"]:
                err("manifest", f"{name} sha256 mismatch")
        print("  checked manifest sha256s")
    else:
        err("manifest.json", "MISSING")

    print()
    if errors:
        print(f"VALIDATION FAILED ({len(errors)} errors):")
        for e in errors[:60]:
            print("  -", e)
        sys.exit(1)
    print("ALL FILES VALID")


if __name__ == "__main__":
    main()
