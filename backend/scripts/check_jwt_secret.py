#!/usr/bin/env python3
"""Verify JWT_SECRET is strong — without ever printing it.

Run wherever the secret is actually set (production shell, Railway console,
CI with the secret injected):

    python backend/scripts/check_jwt_secret.py

It reads JWT_SECRET from the environment and reports length, character
diversity and Shannon entropy, plus a pass/fail verdict. It never prints the
secret, any substring of it, or anything from which it could be reconstructed —
so the output is safe to paste into a ticket or into chat.

Exit code 0 = acceptable, 1 = must be replaced.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.helpers import jwt_secret_problem, MIN_JWT_SECRET_LENGTH  # noqa: E402


def shannon_bits(s: str) -> float:
    """Entropy of the string as typed, in bits. Rough but useful: a 48-char
    token_urlsafe scores ~250+, a dictionary word or repeated pattern scores low."""
    if not s:
        return 0.0
    per_char = -sum(
        (n / len(s)) * math.log2(n / len(s))
        for n in (s.count(c) for c in set(s))
    )
    return per_char * len(s)


def main() -> int:
    secret = os.getenv("JWT_SECRET", "")

    if not secret:
        print("JWT_SECRET: NOT SET")
        print("\nVERDICT: FAIL — the server will refuse to start.")
        print("Generate one with:")
        print('  python -c "import secrets; print(secrets.token_urlsafe(48))"')
        return 1

    classes = sum([
        any(c.islower() for c in secret),
        any(c.isupper() for c in secret),
        any(c.isdigit() for c in secret),
        any(not c.isalnum() for c in secret),
    ])
    bits = shannon_bits(secret)

    print("JWT_SECRET inspection (the value itself is never shown)")
    print(f"  length             : {len(secret)}  (minimum {MIN_JWT_SECRET_LENGTH})")
    print(f"  distinct characters: {len(set(secret))}")
    print(f"  character classes  : {classes}/4 (lower, upper, digit, symbol)")
    print(f"  Shannon entropy    : {bits:.0f} bits  (want >= 128)")

    problem = jwt_secret_problem(secret)
    if problem:
        print(f"\nVERDICT: FAIL — {problem}")
        print("Generate a replacement with:")
        print('  python -c "import secrets; print(secrets.token_urlsafe(48))"')
        print("Rotating invalidates every issued token; users will sign in again.")
        return 1

    if bits < 128:
        print(f"\nVERDICT: WEAK — {bits:.0f} bits of entropy is below the 128-bit "
              "floor for a signing key, even though it passes the startup check.")
        print("Recommend rotating to a generated value.")
        return 1

    print("\nVERDICT: PASS — set, not a known default, long enough, and high entropy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
