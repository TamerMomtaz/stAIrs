"""
lib_secrets.py — shared secret scanning + redaction.

Used by extract_real.py and the synthetic merge step to make sure no real
credential ever lands in the dataset. The validator (validate_final.py)
re-implements the same well-known patterns INDEPENDENTLY so that a sweep of
the final files cross-checks this layer rather than trusting it.

Design intent: flag literal credentials, NOT environment reads or obvious
placeholders. `os.getenv("ANTHROPIC_API_KEY")` and `process.env.X` are fine;
a hard-coded `sk-ant-...` value is not.
"""

import re

# Obvious non-secret placeholders we never flag, even if they sit next to a
# secret-looking keyword.
_PLACEHOLDER = re.compile(
    r"(?i)(your[-_ ]|example|changeme|placeholder|dummy|redacted|xxxx+|"
    r"\.\.\.|<[^>]+>|\$\{[^}]+\}|os\.getenv|os\.environ|process\.env|"
    r"getenv|env\[|settings\.|config\.|f\"|f')"
)

# (name, compiled pattern, replacement). Order matters: specific before generic.
_PATTERNS = [
    ("anthropic_key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{24,}"), "sk-ant-REDACTED"),
    ("openai_key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9]{32,}"), "sk-REDACTED"),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "AKIAREDACTED00000000"),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"), "AIzaREDACTED"),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), "ghp_REDACTED"),
    ("slack_token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"), "xoxb-REDACTED"),
    ("private_key_block",
     re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
                re.DOTALL),
     "-----BEGIN PRIVATE KEY-----\nREDACTED\n-----END PRIVATE KEY-----"),
    ("jwt",
     re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b"),
     "eyJ.REDACTED.JWT"),
    ("bcrypt_hash",
     re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}"),
     "$2b$12$REDACTEDREDACTEDREDACTEDREDACTEDREDACTEDREDACTEDRED"),
]

# Generic "keyword = literal" assignments (after the specific patterns miss).
_GENERIC_ASSIGN = re.compile(
    r"""(?ix)
    \b(password|passwd|secret|secret_key|api[_-]?key|access[_-]?token|
       auth[_-]?token|client[_-]?secret|private[_-]?key)\b
    \s*[:=]\s*
    (['"])(?P<val>[^'"\n]{8,})(\2)
    """
)


def scan(text):
    """Return a list of finding dicts: {type, match (truncated)}."""
    findings = []
    for name, pat, _repl in _PATTERNS:
        for m in pat.finditer(text):
            findings.append({"type": name, "match": _truncate(m.group(0))})
    for m in _GENERIC_ASSIGN.finditer(text):
        val = m.group("val")
        if _PLACEHOLDER.search(m.group(0)) or _PLACEHOLDER.search(val):
            continue
        if _looks_like_code(val):
            continue
        findings.append({"type": "generic_secret_assignment", "match": _truncate(m.group(0))})
    return findings


def redact(text):
    """Return (redacted_text, findings)."""
    findings = scan(text)
    out = text
    for _name, pat, repl in _PATTERNS:
        out = pat.sub(repl, out)

    def _g(m):
        val = m.group("val")
        if _PLACEHOLDER.search(m.group(0)) or _PLACEHOLDER.search(val) or _looks_like_code(val):
            return m.group(0)
        kw, q = m.group(1), m.group(2)
        return f"{kw} = {q}REDACTED_SECRET{q}"

    out = _GENERIC_ASSIGN.sub(_g, out)
    return out, findings


def _looks_like_code(val):
    # Values that are plainly code/identifiers, not literal credentials.
    if val.endswith((")", "(", "}", "]")):
        return True
    if any(tok in val for tok in ("os.", "env", "${", "process.", "self.", "this.")):
        return True
    return False


def _truncate(s, n=12):
    s = s.replace("\n", " ")
    return s[:n] + "..." if len(s) > n else s


if __name__ == "__main__":
    samples = [
        'ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")',  # env read -> clean
        'key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789"',  # secret
        'password = "hunter2hunter2"',  # generic secret
        'password = "changeme"',  # placeholder -> clean
        "JWT_SECRET = os.getenv('JWT_SECRET', 'stairs-dev-secret')",  # env read
    ]
    for s in samples:
        red, f = redact(s)
        print(f"IN : {s}\nOUT: {red}\nHIT: {f}\n")
