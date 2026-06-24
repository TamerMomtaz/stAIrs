"""
lib_schema.py — record construction, schema wrappers, ASCII/format enforcement.

Canonical pair = {"system","user","assistant"}. We emit the SAME pairs in two
wrappers (Anthropic Messages + axolotl chat_template). Files are pure ASCII
(ensure_ascii -> \\uXXXX), LF, no BOM, no blank lines, exactly one trailing \\n.
"""
import json, re

# One consistent system message across every record (both phases, both schemas).
SYSTEM = (
    "You are a senior engineer on Stairs, a strategic-planning platform with a "
    "FastAPI + PostgreSQL (asyncpg) backend and a React + Vite + Tailwind frontend. "
    "The user names exactly one target file in backticks and describes a change. "
    "Respond with exactly one fenced code block and no prose: a unified diff in a "
    "```diff block when modifying or adding to existing code, or the complete file "
    "in a language-tagged block (```python, ```jsx, ```sql, ...) when authoring a new file."
)

_FENCE_RE = re.compile(r"^```[^\n]*\n.*\n```$", re.S)

def make_canonical(user: str, assistant: str, system: str = SYSTEM) -> dict:
    return {"system": system, "user": user, "assistant": assistant}

def wrap_anthropic(pair: dict) -> dict:
    return {
        "system": pair["system"],
        "messages": [
            {"role": "user", "content": pair["user"]},
            {"role": "assistant", "content": pair["assistant"]},
        ],
    }

def wrap_axolotl(pair: dict) -> dict:
    return {
        "messages": [
            {"role": "system", "content": pair["system"]},
            {"role": "user", "content": pair["user"]},
            {"role": "assistant", "content": pair["assistant"]},
        ],
    }

WRAPPERS = {"anthropic": wrap_anthropic, "axolotl": wrap_axolotl}

def assistant_is_single_code_block(assistant: str) -> bool:
    s = assistant.strip()
    if not _FENCE_RE.match(s):
        return False
    # exactly one fence pair: count opening fences at line starts
    opens = re.findall(r"(?m)^```", s)
    return len(opens) == 2

def dumps(obj: dict) -> str:
    """Compact, pure-ASCII single line (no trailing newline)."""
    return json.dumps(obj, ensure_ascii=True, separators=(",", ":"))

def validate_record(rec: dict, schema: str):
    """Return list of problems (empty == valid). Independent of the builder."""
    probs = []
    raw = dumps(rec)
    try:
        raw.encode("ascii")
    except UnicodeEncodeError as e:
        probs.append(f"non-ascii: {e}")
    if "\n" in raw or "\r" in raw:
        probs.append("embedded newline in serialized line")
    if schema == "anthropic":
        if not rec.get("system"):
            probs.append("missing system")
        msgs = rec.get("messages", [])
        roles = [m.get("role") for m in msgs]
        if roles != ["user", "assistant"]:
            probs.append(f"anthropic roles != [user,assistant]: {roles}")
    elif schema == "axolotl":
        msgs = rec.get("messages", [])
        roles = [m.get("role") for m in msgs]
        if roles != ["system", "user", "assistant"]:
            probs.append(f"axolotl roles != [system,user,assistant]: {roles}")
    else:
        probs.append(f"unknown schema {schema}")
    msgs = rec.get("messages", [])
    for m in msgs:
        if not isinstance(m.get("content"), str) or not m["content"].strip():
            probs.append(f"empty/non-str content role={m.get('role')}")
    # assistant must be a single fenced code block
    asst = next((m["content"] for m in msgs if m.get("role") == "assistant"), "")
    if asst and not assistant_is_single_code_block(asst):
        probs.append("assistant not a single fenced code block")
    return probs

def write_jsonl(path, records):
    """Write records as JSONL: LF, no BOM, no blank lines, exactly one trailing \\n."""
    lines = [dumps(r) for r in records]
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write("\n".join(lines))
        if lines:
            f.write("\n")
    return len(lines)


if __name__ == "__main__":
    p = make_canonical("Edit `backend/app/main.py` to add X.", "```diff\n- a\n+ b\n```")
    for sch, wrap in WRAPPERS.items():
        rec = wrap(p)
        probs = validate_record(rec, sch)
        print(sch, "->", "OK" if not probs else probs)
        print("   ", dumps(rec)[:120])
    # arabic ascii-escape check
    ar = make_canonical("Edit `x` for الرؤية", "```diff\n+الرؤية\n```")
    line = dumps(wrap_anthropic(ar))
    print("ascii-only:", all(ord(c) < 128 for c in line))
