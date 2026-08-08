import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeAiResult,
  classifyAiFailure,
  containsLeak,
  aiFailureCopy,
  safeAiText,
  promptTurn,
  isPromptTurn,
  FAILURE_KINDS,
} from "../lib/aiResilience";

// The exact string production was rendering into the client's chat bubble
// on 8 Aug 2026.
const THE_BUG = "AI service returned status 404. Please try again.";

// A genuine answer, in the shape the wizard's extractElements() parses.
const REAL_OUTPUT = `[Vision]: Become the leading tailored-AI partner in the GCC.
[Objective 1]: Reach 40 enterprise accounts by Q4
[KR 1.1]: Close 12 pilots per quarter
[Initiative 1.1]: Build a co-authoring onboarding programme`;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("normalizeAiResult — the poisoned success", () => {
  it("classifies the production 404 string as a FAILURE, not an answer", () => {
    const r = normalizeAiResult({ response: THE_BUG });
    expect(r.ok).toBe(false);
    expect(r.text).toBe("");
    expect(r.copy.title).toBeTruthy();
    expect(r.retryable).toBe(true);
  });

  it("never hands the raw string back for rendering", () => {
    const r = normalizeAiResult({ response: THE_BUG });
    expect(JSON.stringify(r)).not.toContain("404");
    expect(JSON.stringify(r)).not.toContain("status");
  });

  it.each([
    ["a bare status line", "AI service returned status 503. Please try again."],
    ["an HTTP prefix", "HTTP 429 Too Many Requests"],
    ["an api error type", "not_found_error"],
    ["a rate limit type", "rate_limit_error: slow down"],
    ["an overloaded type", "overloaded_error"],
    ["an auth error type", "authentication_error"],
    ["a vendor host beside an error token", "Error calling api.anthropic.com"],
    ["a model id beside not-found", "model claude-sonnet-4-20250514 not found"],
    ["the real 404 body", '{"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4-20250514"}}'],
    ["a fetch failure", "Failed to fetch"],
    ["a traceback", "Traceback (most recent call last): ..."],
    ["the api.js throw format", "POST /api/v1/ai/chat → 404"],
  ])("catches %s", (_label, body) => {
    expect(containsLeak(body)).toBe(true);
    expect(normalizeAiResult({ response: body }).ok).toBe(false);
  });

  it("treats empty text as a failure", () => {
    expect(normalizeAiResult({ response: "" }).ok).toBe(false);
    expect(normalizeAiResult({ response: "   " }).ok).toBe(false);
    expect(normalizeAiResult({}).ok).toBe(false);
    expect(normalizeAiResult(undefined).ok).toBe(false);
  });
});

describe("normalizeAiResult — genuine output passes through untouched", () => {
  it("lets a real staircase through byte for byte", () => {
    const r = normalizeAiResult({ response: REAL_OUTPUT });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(REAL_OUTPUT);
    expect(r.kind).toBeNull();
    expect(r.copy).toBeNull();
  });

  it("does not trip on ordinary strategy prose containing numbers", () => {
    const text =
      "Target 500 accounts by 2027, a 300% increase, with a status review every 30 days.";
    expect(containsLeak(text)).toBe(false);
    expect(normalizeAiResult({ response: text }).ok).toBe(true);
  });

  it("answers a short model-selection question without censoring it", () => {
    // The client's product IS AI consulting — this is the deliverable, not a leak.
    const text = "For your use case Claude 4.6 handles long context better than GPT-4o.";
    expect(text.length).toBeLessThan(100);
    expect(containsLeak(text)).toBe(false);
    const r = normalizeAiResult({ response: text });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(text);
  });

  it.each([
    "We recommend Anthropic's Claude for the advisor tier.",
    "Anthropic and OpenAI both price per token; budget 500 USD a month.",
    "Claude 4.6 vs GPT-4o: pick Claude for 200k-token documents.",
    "A 300% increase in throughput is realistic on Claude 4.6.",
  ])("lets vendor talk through when no error token rides along: %s", (text) => {
    expect(containsLeak(text)).toBe(false);
  });

  it("no longer treats a vendor name beside a number as a leak", () => {
    // This used to fail: a bare status code was an error token, so pricing and
    // sizing prose tripped the vendor gate. The digit token was dropped because
    // the structural patterns catch a status-carrying leak on their own.
    expect(containsLeak("Anthropic pricing starts near 500 USD a month.")).toBe(false);
    expect(containsLeak("Claude 4.6 handles 200k tokens; GPT-4o caps at 128k.")).toBe(false);
    // ...and a genuine leak carrying a status code is still caught, gate or no gate.
    expect(containsLeak("AI service returned status 404. Please try again.")).toBe(true);
    expect(containsLeak("HTTP 503 from api.anthropic.com")).toBe(true);
  });

  it("still catches a vendor name the moment an error token joins it", () => {
    expect(containsLeak("Anthropic request failed")).toBe(true);
    expect(containsLeak("Unauthorized calling Anthropic")).toBe(true);
    expect(containsLeak("claude-sonnet-4-6 not found")).toBe(true);
    expect(containsLeak("Error from api.anthropic.com")).toBe(true);
  });

  it("does not censor a long analysis that happens to name an AI vendor", () => {
    const text =
      "## Competitive Landscape\n\nThe generative-AI vendor market is consolidating. " +
      "Anthropic, alongside other frontier labs, sells API access to enterprises, which " +
      "compresses margins for integrators. Your differentiation is tailored solutions and " +
      "co-authored onboarding rather than raw model resale, so position on service depth. ".repeat(3);
    expect(text.length).toBeGreaterThan(400);
    expect(normalizeAiResult({ response: text }).ok).toBe(true);
  });

  it("reads content[0].text as well as response", () => {
    const r = normalizeAiResult({ content: [{ type: "text", text: REAL_OUTPUT }] });
    expect(r.ok).toBe(true);
    expect(r.text).toBe(REAL_OUTPUT);
  });
});

describe("normalizeAiResult — the other two failure shapes", () => {
  it("handles a thrown Error", () => {
    const r = normalizeAiResult(new Error("POST /api/v1/ai/chat → 500"));
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("unavailable");
  });

  it("handles an ok:false envelope from the backend", () => {
    const r = normalizeAiResult({ ok: false, error_kind: "busy", response: "…" });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("busy");
  });

  it("maps the backend's no_key to plain unavailable", () => {
    expect(normalizeAiResult({ ok: false, error_kind: "no_key" }).kind).toBe("unavailable");
  });

  it("marks a timed-out session as non-retryable", () => {
    const r = normalizeAiResult(new Error("Session expired"));
    expect(r.kind).toBe("session");
    expect(r.retryable).toBe(false);
  });
});

describe("classifyAiFailure", () => {
  it.each([
    ["Session expired", "session"],
    ["POST /api/v1/ai/chat → 401", "session"],
    ["POST /api/v1/ai/chat → 429", "busy"],
    ["POST /api/v1/ai/chat → 529", "busy"],
    ["rate_limit_error", "busy"],
    ["Failed to fetch", "offline"],
    ["POST /api/v1/ai/chat → 413", "too_long"],
    ["prompt is too long", "too_long"],
    ["POST /api/v1/ai/chat → 500", "unavailable"],
    ["AI service returned status 404. Please try again.", "unavailable"],
  ])("classifies %s as %s", (input, kind) => {
    expect(classifyAiFailure(input)).toBe(kind);
  });

  it("prefers the backend's own error_kind over guessing", () => {
    expect(classifyAiFailure({ error_kind: "too_long", message: "429" })).toBe("too_long");
  });
});

describe("client-facing copy", () => {
  it("exists in EN and AR for every kind", () => {
    for (const kind of FAILURE_KINDS) {
      for (const lang of ["en", "ar"]) {
        const c = aiFailureCopy(kind, lang);
        expect(c.title.length).toBeGreaterThan(0);
        expect(c.body.length).toBeGreaterThan(0);
      }
    }
  });

  it("never contains a status code, vendor name, or model id", () => {
    for (const kind of FAILURE_KINDS) {
      for (const lang of ["en", "ar"]) {
        const { title, body } = aiFailureCopy(kind, lang);
        const text = `${title} ${body}`;
        expect(text).not.toMatch(/\d{3}/);
        expect(text).not.toMatch(/\bHTTP\b/i);
        expect(text).not.toMatch(/anthropic|claude-/i);
        expect(text).not.toMatch(/_error\b/);
      }
    }
  });

  it("falls back to English for an unknown language", () => {
    expect(aiFailureCopy("busy", "fr")).toEqual(aiFailureCopy("busy", "en"));
  });

  it("falls back to unavailable for an unknown kind", () => {
    expect(aiFailureCopy("nonsense")).toEqual(aiFailureCopy("unavailable"));
  });
});

describe("safeAiText — the last line of defence", () => {
  it("swaps plumbing for human copy", () => {
    const out = safeAiText(THE_BUG);
    expect(out).not.toContain("404");
    expect(out).toContain(aiFailureCopy("unavailable").title);
  });

  it("leaves a real answer alone", () => {
    expect(safeAiText(REAL_OUTPUT)).toBe(REAL_OUTPUT);
  });
});

describe("promptTurn — scaffolding stays off the client's screen", () => {
  it("keeps display and payload separate", () => {
    const t = promptTurn(
      "Generate the full staircase from everything we've discussed.",
      "…\n\nFormat:\n[Vision]: ...\n[Objective 1]: ...\n[KR 1.1]: ...",
    );
    expect(t.display).toBe("Generate the full staircase from everything we've discussed.");
    expect(t.display).not.toContain("[Vision]");
    expect(t.display).not.toContain("Format:");
    expect(t.payload).toContain("[Vision]");
    expect(t.hidden).toBe(true);
  });

  it("degrades to a plain turn when there is nothing to hide", () => {
    const t = promptTurn("What are the biggest risks?");
    expect(t.payload).toBe(t.display);
    expect(t.hidden).toBe(false);
  });

  it("is recognisable to senders that accept both strings and turns", () => {
    expect(isPromptTurn(promptTurn("a", "b"))).toBe(true);
    expect(isPromptTurn("a plain string")).toBe(false);
    expect(isPromptTurn(null)).toBe(false);
  });
});
