"""
lib_tokens.py — token counting for the MAXTOK cap.

PLATFORM = Anthropic Messages + axolotl. Neither has a fully-local official
tokenizer here (Claude tokenization needs the API; axolotl's cap depends on the
chosen base model). We therefore measure with tiktoken o200k_base as a CLEARLY
LABELED approximation. This is honest: records sit far under 16k either way, so
the approximation cannot flip a cap decision in practice.
"""
TOKENIZER_LABEL = "tiktoken/o200k_base (LABELED APPROX for Anthropic & axolotl)"

_enc = None
def _encoder():
    global _enc
    if _enc is None:
        import tiktoken
        _enc = tiktoken.get_encoding("o200k_base")
    return _enc

def count_tokens_text(text: str) -> int:
    return len(_encoder().encode(text))

def count_tokens_record(rec: dict) -> int:
    """Sum tokens across system + all message contents (+ small per-message overhead)."""
    enc = _encoder()
    total = 0
    if rec.get("system"):
        total += len(enc.encode(rec["system"])) + 3
    for m in rec.get("messages", []):
        total += len(enc.encode(m.get("content", ""))) + 4
    return total


if __name__ == "__main__":
    print("label:", TOKENIZER_LABEL)
    print("sample tokens:", count_tokens_text("hello world, fine-tuning dataset"))
