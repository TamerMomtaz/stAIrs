"""
lib_secrets.py — secret-scan + redaction for the Stairs fine-tuning dataset.

Used by both phases. Rules (from the task spec):
  - Strip the diff line prefix (+/-/space) FIRST, then redact in place.
  - Redact: JWTs (eyJ...), sk-/sk-ant- keys, AKIA..., Bearer <token>, bcrypt
    hashes, and *_SECRET/SERVICE_ROLE/API_KEY/ENC_KEY/AUTH_TOKEN/PASSWORD literals.
  - HARVESTED repo literals (found in README/.env.example/schema.sql) redacted
    everywhere: seed password `stairs2026`, the seed bcrypt hash, tee@devoneers.com.
  - Allowlist obvious placeholders + env-reads + the synthetic all-zero seed UUIDs.

Import-side-effect-free: only the self-test under __main__ does anything.
"""
import re

# ── Harvested real literals (redact everywhere they appear) ──
# Deploy hosts harvested from source + git history (tenant-specific infra ids).
# https:// variants first so the prefix is preserved when redacting.
HARVESTED = {
    "https://st-a-irs.vercel.app": "https://<REDACTED_DEPLOY_HOST>",
    "https://stairs-production.up.railway.app": "https://<REDACTED_DEPLOY_HOST>",
    "st-a-irs.vercel.app": "<REDACTED_DEPLOY_HOST>",
    "stairs-production.up.railway.app": "<REDACTED_DEPLOY_HOST>",
    "stairs2026": "<REDACTED_SEED_PASSWORD>",
    "$2b$12$LJ3b5fG8y8F2Q1Z7z8Y6hO9X4w3v2u1t0s9r8q7p6o5n4m3l2k1j0": "<REDACTED_BCRYPT_HASH>",
    "tee@devoneers.com": "<REDACTED_EMAIL>",
}

# Generic PaaS deploy-host subdomains (future-proof). Does NOT match the legit
# code regex `https://.*\.vercel\.app` (the chars before `.vercel` aren't a label).
PAAS_HOST = re.compile(
    r"\b[a-z0-9][a-z0-9-]{1,40}\.(?:vercel\.app|up\.railway\.app|railway\.app|"
    r"onrender\.com|fly\.dev|netlify\.app|supabase\.co)\b", re.I)

# ── Values that are NOT secrets (placeholders / env-reads) ──
ALLOW_SUBSTR = (
    "your-key-here", "generate-a-random", "changeme", "change-me", "change_this",
    "placeholder", "example.com", "dev-secret", "dev-fallback", "insecure-dev",
    "xxxxx", "<your", "<redacted", "redacted_", "os.environ", "os.getenv",
    "getenv(", "process.env", "${", "settings.", "config.", "env.",
)
# Synthetic seed UUIDs (a0000000-0000-0000-0000-0000000000NN) — demo data, not infra ids.
SEED_UUID = re.compile(r"\b[0-9a-f]0000000-0000-0000-0000-0000000000\d{2}\b", re.I)

def _is_allowed(value: str) -> bool:
    v = value.strip().strip("\"'`")
    if not v or len(v) < 6:
        return True
    low = v.lower()
    if any(s in low for s in ALLOW_SUBSTR):
        return True
    if SEED_UUID.fullmatch(v) or SEED_UUID.match(v):
        return True
    return False

# ── Pattern-based redactors: (compiled regex, replacement, needs_value_check) ──
JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}")
SK_ANT = re.compile(r"sk-ant-[A-Za-z0-9_-]{16,}")
SK_OPENAI = re.compile(r"sk-(?!ant-)[A-Za-z0-9]{20,}")
AKIA = re.compile(r"\bAKIA[0-9A-Z]{16}\b")
BEARER = re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]{12,}")
BCRYPT = re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")
GHP = re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")
PRIVKEY = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")
# Secret-named assignment:  NAME = "value"  /  NAME: "value"  /  "NAME": "value"
SECRET_ASSIGN = re.compile(
    r"""(?ix)
    (["']?)
    (\w*(?:SECRET|SERVICE_ROLE|API_KEY|APIKEY|ENC_KEY|AUTH_TOKEN|ACCESS_TOKEN|
        PASSWORD|PASSWD|PRIVATE_KEY|SECRET_KEY|CLIENT_SECRET)\w*)
    \1
    (\s*[:=]\s*)
    (["'])([^"']{4,})\4
    """,
)

def redact_value_assign(m: re.Match) -> str:
    name, sep, q, val = m.group(2), m.group(3), m.group(4), m.group(5)
    pre = m.group(1)
    if _is_allowed(val):
        return m.group(0)
    return f"{pre}{name}{pre}{sep}{q}<REDACTED_SECRET>{q}"

def redact_content(text: str):
    """Redact secrets in a raw content string (no diff prefix). Returns (text, hits)."""
    hits = []
    def sub(pattern, repl, label, value_aware=False):
        nonlocal text
        def _r(m):
            if value_aware and _is_allowed(m.group(0)):
                return m.group(0)
            hits.append(label)
            return repl
        text = pattern.sub(_r, text)
    # Harvested exact literals first
    for lit, repl in HARVESTED.items():
        if lit in text:
            text = text.replace(lit, repl)
            hits.append("harvested:" + repl)
    sub(JWT, "<REDACTED_JWT>", "jwt")
    sub(SK_ANT, "<REDACTED_API_KEY>", "sk-ant", value_aware=True)
    sub(SK_OPENAI, "<REDACTED_API_KEY>", "sk-openai", value_aware=True)
    sub(AKIA, "<REDACTED_AWS_KEY>", "akia")
    sub(PAAS_HOST, "<REDACTED_DEPLOY_HOST>", "paas-host")
    sub(GHP, "<REDACTED_GH_TOKEN>", "gh-token")
    sub(BCRYPT, "<REDACTED_BCRYPT_HASH>", "bcrypt")
    sub(PRIVKEY, "-----BEGIN PRIVATE KEY-----<REDACTED>", "private-key")
    text = BEARER.sub(lambda m: (hits.append("bearer") or (m.group(1) + "<REDACTED_TOKEN>")), text)
    before = text
    text = SECRET_ASSIGN.sub(redact_value_assign, text)
    if text != before:
        hits.append("secret-assign")
    return text, hits

# Diff body lines start with one of these; headers must NOT be redacted-as-content.
_DIFF_PREFIXES = (" ", "+", "-")
_HEADER_PREyes = ("+++ ", "--- ", "diff --git", "index ", "@@ ", "new file", "old file",
                  "deleted file", "rename ", "similarity ", "copy ", "Binary files")

def redact_diff(diff_text: str):
    """Redact secrets in a unified diff, preserving structure. Returns (diff, hits)."""
    out, all_hits = [], []
    for line in diff_text.split("\n"):
        if line.startswith(_HEADER_PREyes) or not line:
            out.append(line); continue
        if line[0] in _DIFF_PREFIXES and not line.startswith(("+++ ", "--- ")):
            prefix, body = line[0], line[1:]
            red, hits = redact_content(body)
            out.append(prefix + red)
            all_hits.extend(hits)
        else:
            red, hits = redact_content(line)
            out.append(red)
            all_hits.extend(hits)
    return "\n".join(out), all_hits

def scan_text(text: str):
    """Detect (don't modify) — returns list of secret labels found. For validation."""
    _, hits = redact_content(text)
    return hits


if __name__ == "__main__":
    tests = [
        ('+    password_hash = "$2b$12$LJ3b5fG8y8F2Q1Z7z8Y6hO9X4w3v2u1t0s9r8q7p6o5n4m3l2k1j0"', True),
        ('+ANTHROPIC_API_KEY=sk-ant-api03-REALLOOKINGKEYabcdef1234567890', True),
        ('+ANTHROPIC_API_KEY=sk-ant-your-key-here', False),
        ('+    SECRET = os.environ.get("JWT_SECRET", "dev-secret")', False),
        ('+    JWT_SECRET = "9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c"', True),
        (' org_id = "a0000000-0000-0000-0000-000000000001"', False),
        ('+  "Authorization": "Bearer eyJhbGciOiJIUzI1Ni3.eyJzdWIiOiIxMjM0NQ.abcDEF123456789", ', True),
        ('+    email = "tee@devoneers.com"', True),
        ('-    db = "postgresql://stairs:stairs2026@localhost:5432/stairs"', True),
    ]
    print("=== lib_secrets self-test ===")
    ok = True
    for line, should_redact in tests:
        red, hits = redact_diff(line)
        changed = (red != line)
        status = "OK" if changed == should_redact else "FAIL"
        if status == "FAIL":
            ok = False
        print(f"[{status}] redacted={changed} expect={should_redact} hits={hits}")
        if changed:
            print("        ->", red.strip())
    print("ALL PASS" if ok else "SOME FAILED")
