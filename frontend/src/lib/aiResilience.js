/* ═══════════════════════════════════════════════════════════════════
   Stairs — AI Resilience Layer

   THE PROBLEM THIS SOLVES
   ───────────────────────
   The backend used to return HTTP 200 with a *failure string* inside
   `res.response`. The frontend could not tell that apart from a real
   answer, so it rendered raw plumbing into a chat bubble in front of a
   paying client:

       "AI service returned status 404. Please try again."

   Second offence, same screen: askForStrategy() pasted the internal prompt
   template into the input box, so the client's own message bubble showed
   "[Vision]: … [Objective 1]: … Be specific and tailored to this marketing
   strategy context." — our scaffolding, on their screen.

   THE RULE
   ────────
   A client never sees a status code, a stack trace, a vendor name, or a
   prompt template. They see the product. Engineers see the detail in the
   console and in GET /api/v1/ai/status.
   ═══════════════════════════════════════════════════════════════════ */

/* NOTE ON PRECEDENCE
   Once the patched backend is deployed, `res.ok === false` is the primary and
   authoritative failure signal — the server tells us plainly. Everything below
   is a safety net for stale frontends talking to an un-patched backend (and for
   any future path that forgets to set the flag). Tune the regexes for that role:
   they should catch plumbing, not police legitimate answers. */

/* Structural giveaways: these never belong in an answer, at any length. */
const LEAK_PATTERNS = [
  /returned status\s*\d{3}/i,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/\S+\s*(?:→|->)\s*\d{3}/i,
  /\bHTTP\s*\d{3}\b/i,
  /\b(?:not_found|rate_limit|authentication|permission|invalid_request|overloaded|api)_error\b/i,
  /traceback|stack trace|exception:|\bundefined\b.*\bis not\b/i,
  /failed to fetch|networkerror|econnrefused|etimedout/i,
  /^\s*session expired\s*$/i, // technically true, but bare — we can say it better
];

/* Vendor and model names. This client's product IS AI consulting, so naming
   Claude, Anthropic or GPT-4o is ordinary product output — "which model suits
   our use case?" deserves a real answer, at any length. A vendor mention only
   reads as plumbing when it arrives *alongside* a structural error token, so
   require both. */
const VENDOR_PATTERNS = [
  /anthropic|api\.anthropic\.com|x-api-key/i,
  /claude-[a-z0-9]*-?\d/i,
];
// 4xx/5xx only: a 2xx/3xx number in prose ("300% increase") is never a failure
// signal, so including it would cost false positives and buy nothing.
// Residual, accepted knowingly: a sentence that names a vendor AND contains a
// bare 4xx/5xx number ("Anthropic pricing starts near 500 USD") reads as a leak.
// Rare, and moot once the backend sets res.ok.
const ERROR_TOKEN = /\b[45]\d{2}\b|\bstatus\b|\berror\b|\bfailed\b|not[ _]?found|unauthoriz|traceback/i;

/* ── What the customer actually reads ── */
const COPY = {
  busy: {
    en: {
      title: "The assistant is catching up",
      body: "It's handling a lot of requests right now. Give it about thirty seconds and try again — everything you've entered is saved.",
    },
    ar: {
      title: "المساعد مشغول قليلاً",
      body: "هناك ضغط على الطلبات حاليًا. انتظر حوالي ثلاثين ثانية ثم أعد المحاولة — كل ما أدخلته محفوظ.",
    },
  },
  unavailable: {
    en: {
      title: "The assistant is briefly unavailable",
      body: "Nothing you've entered is lost. Try again in a moment, or keep building manually and generate later.",
    },
    ar: {
      title: "المساعد غير متاح مؤقتًا",
      body: "لم يُفقد أي شيء أدخلته. أعد المحاولة بعد لحظات، أو تابع البناء يدويًا وقم بالتوليد لاحقًا.",
    },
  },
  offline: {
    en: {
      title: "Can't reach the assistant",
      body: "This looks like a connection issue on the network. Check the connection and try again — your inputs are saved locally.",
    },
    ar: {
      title: "تعذّر الوصول إلى المساعد",
      body: "يبدو أن هناك مشكلة في الاتصال بالشبكة. تحقق من الاتصال وأعد المحاولة — مدخلاتك محفوظة محليًا.",
    },
  },
  too_long: {
    en: {
      title: "That's a lot to take in at once",
      body: "Try narrowing it to a single objective and generating again — you'll get a sharper staircase too.",
    },
    ar: {
      title: "هذا كثير للمعالجة دفعة واحدة",
      body: "جرّب تضييقه إلى هدف واحد وأعد التوليد — ستحصل على سلّم أوضح أيضًا.",
    },
  },
  session: {
    en: {
      title: "Your session timed out",
      body: "Sign in again to pick up exactly where you left off.",
    },
    ar: {
      title: "انتهت جلستك",
      body: "سجّل الدخول مرة أخرى للمتابعة من حيث توقفت.",
    },
  },
};

export const FAILURE_KINDS = Object.keys(COPY);

/* Backend error_kind → the kind we show. */
const KIND_FROM_BACKEND = {
  busy: "busy",
  too_long: "too_long",
  offline: "offline",
  no_key: "unavailable",
  unavailable: "unavailable",
  session: "session",
};

/**
 * Work out what actually went wrong, from whatever we were handed —
 * a thrown Error, a failure envelope, or a poisoned success string.
 * @returns {"busy"|"unavailable"|"offline"|"too_long"|"session"}
 */
export function classifyAiFailure(input) {
  if (input && typeof input === "object" && input.error_kind) {
    const mapped = KIND_FROM_BACKEND[input.error_kind];
    if (mapped) return mapped;
  }

  const raw = String(
    (input && (input.message || input.error_kind || input.response || input.text)) || input || ""
  );

  if (/session expired|\b401\b|unauthor/i.test(raw)) return "session";
  if (/\b429\b|\b529\b|rate.?limit|overloaded|too many requests/i.test(raw)) return "busy";
  if (/failed to fetch|networkerror|offline|econnrefused|etimedout|timeout/i.test(raw)) return "offline";
  if (/\b413\b|too long|max_tokens|context.?length|payload too large/i.test(raw)) return "too_long";
  return "unavailable";
}

/** True when a string contains plumbing a customer must never see. */
export function containsLeak(text) {
  if (!text || typeof text !== "string") return false;
  if (LEAK_PATTERNS.some((re) => re.test(text))) return true;
  // A vendor name on its own is legitimate product output; a vendor name next
  // to an error token is our plumbing wearing an answer's clothes.
  if (VENDOR_PATTERNS.some((re) => re.test(text)) && ERROR_TOKEN.test(text)) return true;
  return false;
}

/** The customer-facing copy for a failure kind. */
export function aiFailureCopy(kind, lang = "en") {
  const block = COPY[kind] || COPY.unavailable;
  return block[lang] || block.en;
}

function failure(kind, lang) {
  return {
    ok: false,
    kind,
    text: "",
    copy: aiFailureCopy(kind, lang),
    retryable: kind !== "session",
  };
}

/**
 * THE ONE FUNCTION TO WRAP EVERY AI CALL IN.
 *
 * Turns any AI result — success, failure envelope, thrown error, or a
 * 200-with-an-error-string — into a single predictable shape.
 *
 *   let res; try { res = await api.aiPost(PATH, body); } catch (e) { res = e; }
 *   const r = normalizeAiResult(res, { lang });
 *   if (!r.ok) show <AiUnavailable kind={r.kind} onRetry={…} />
 *   else       show <Markdown text={r.text} />
 */
export function normalizeAiResult(res, { lang = "en" } = {}) {
  // 1. Thrown error / rejected promise
  if (res instanceof Error) {
    const kind = classifyAiFailure(res);
    console.error("[stairs.ai] request failed:", res);
    return failure(kind, lang);
  }

  // 2. Backend told us plainly it failed (ai_client envelope)
  if (res && typeof res === "object" && res.ok === false) {
    const kind = classifyAiFailure(res);
    console.error("[stairs.ai] backend reported AI failure:", res.error_kind || kind, res);
    return failure(kind, lang);
  }

  const raw =
    (res && (res.response ?? res.text ?? res.message)) ??
    (res && res.content && res.content[0] && res.content[0].text) ??
    "";
  const text = typeof raw === "string" ? raw : String(raw ?? "");

  // 3. Backend said 200 but the body is plumbing (legacy backend, pre-patch)
  if (containsLeak(text)) {
    const kind = classifyAiFailure(text);
    console.error("[stairs.ai] leaked technical error intercepted:", text);
    return { ...failure(kind, lang), retryable: true };
  }

  // 4. Nothing came back at all
  if (!text.trim()) return failure("unavailable", lang);

  return { ok: true, kind: null, text, copy: null, retryable: false };
}

/**
 * Last line of defence. Wrap any string right before it renders.
 * If plumbing somehow got this far, swap it for human copy.
 */
export function safeAiText(text, lang = "en") {
  if (containsLeak(text)) {
    const c = aiFailureCopy(classifyAiFailure(text), lang);
    return `${c.title}. ${c.body}`;
  }
  return text;
}

/**
 * Separate what we SEND to the model from what the CLIENT SEES.
 *
 *   const t = promptTurn("Generate the full staircase now", buildTemplate());
 *   render t.display   ← short, human, presentable
 *   send    t.payload  ← the full scaffolded instruction
 */
export function promptTurn(display, payload) {
  return { display, payload: payload ?? display, hidden: payload !== undefined && payload !== display };
}

/** True for anything promptTurn() produced, so senders can accept both. */
export function isPromptTurn(value) {
  return !!value && typeof value === "object" && typeof value.display === "string" && "payload" in value;
}

/** Optional: confirm the assistant is alive before opening the builder. */
export async function checkAiHealth(apiBase, token) {
  try {
    const r = await fetch(`${apiBase}/api/v1/ai/status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) return { healthy: false };
    return await r.json();
  } catch {
    return { healthy: false };
  }
}
