/**
 * The regression, end to end, in the screen it happened on.
 *
 * On 8 Aug 2026 the AI Strategy Builder showed a client two things it should
 * never have shown them: our prompt template in their own message bubble, and
 * "AI service returned status 404. Please try again." where the strategy
 * should have been.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";

const aiPost = vi.fn();
vi.mock("../api", () => ({
  api: {
    aiPost: (...args) => aiPost(...args),
    get: vi.fn(() => Promise.resolve({})),
    post: vi.fn(() => Promise.resolve({})),
  },
  SourcesAPI: { count: vi.fn(() => Promise.resolve({ count: 0 })) },
  extractDocumentText: vi.fn(() => Promise.resolve({ documents: [] })),
}));

import { StrategyWizard } from "../components/StrategyWizard";
import { aiFailureCopy } from "../lib/aiResilience";

const THE_BUG = "AI service returned status 404. Please try again.";
const REAL_OUTPUT =
  "[Vision]: Become the leading tailored-AI partner\n[Objective 1]: Reach 40 enterprise accounts";

/**
 * Drive the wizard to step 3 (the AI builder) with the questionnaire skipped,
 * then hand the test a clean mock so its own expectations are exact.
 */
async function openBuilder({ lang = "en" } = {}) {
  aiPost.mockResolvedValue({ groups: [] }); // step 2 asks for a questionnaire
  const utils = render(<StrategyWizard open onClose={() => {}} onCreate={vi.fn()} lang={lang} />);

  fireEvent.change(screen.getByPlaceholderText(/Growth Plan 2026/), { target: { value: "Q4 Plan" } });
  fireEvent.click(screen.getByText("Marketing Strategy"));
  fireEvent.click(screen.getByText(/Next → Strategy Questionnaire/));
  await act(async () => {
    fireEvent.click(screen.getByText(/Skip — Fill Manually/));
  });
  await screen.findByText(/Skip questionnaire/);
  fireEvent.click(screen.getByText(/Skip questionnaire/));
  await screen.findByPlaceholderText(/Describe your goals|صف أهدافك/);
  aiPost.mockReset();
  return utils;
}

async function sendMessage(text = "We want to expand across the MENA region") {
  fireEvent.change(screen.getByPlaceholderText(/Describe your goals|صف أهدافك/), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByText(/^(Send|إرسال)$/));
  });
}

beforeEach(() => {
  aiPost.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(cleanup);

describe("StrategyWizard — the 404 never reaches the client", () => {
  it("renders the calm card instead of the poisoned 200 body", async () => {
    await openBuilder();
    aiPost.mockResolvedValue({ response: THE_BUG, tokens_used: 0 });
    await sendMessage();

    expect(await screen.findByTestId("ai-unavailable")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(THE_BUG);
    expect(document.body.textContent).not.toContain("404");
    expect(screen.getByText(aiFailureCopy("unavailable").title)).toBeInTheDocument();
  });

  it("renders the calm card when the request throws instead", async () => {
    await openBuilder();
    aiPost.mockRejectedValue(new Error("POST /api/v1/ai/chat → 404"));
    await sendMessage();

    expect(await screen.findByTestId("ai-unavailable")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("404");
  });

  it("reads the ok:false envelope and picks the matching copy", async () => {
    await openBuilder();
    aiPost.mockResolvedValue({ ok: false, error_kind: "busy", response: "…" });
    await sendMessage();

    const card = await screen.findByTestId("ai-unavailable");
    expect(card).toHaveAttribute("data-kind", "busy");
    expect(screen.getByText(aiFailureCopy("busy").title)).toBeInTheDocument();
  });

  it("retries the same turn when the client clicks Try again", async () => {
    await openBuilder();
    aiPost.mockResolvedValueOnce({ response: THE_BUG });
    aiPost.mockResolvedValueOnce({ response: REAL_OUTPUT, tokens_used: 42 });
    await sendMessage("Expand across MENA");

    await screen.findByTestId("ai-unavailable");
    await act(async () => {
      fireEvent.click(screen.getByText("Try again"));
    });

    await waitFor(() => expect(screen.queryByTestId("ai-unavailable")).toBeNull());
    expect(aiPost).toHaveBeenCalledTimes(2);
    // The retry sends the identical payload — nothing about the turn is lost.
    expect(aiPost.mock.calls[1][1].message).toBe(aiPost.mock.calls[0][1].message);
  });

  it("still renders a genuine answer, and captures its elements", async () => {
    await openBuilder();
    aiPost.mockResolvedValue({ response: REAL_OUTPUT, tokens_used: 42 });
    await sendMessage();

    expect((await screen.findAllByText(/Become the leading tailored-AI partner/)).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("ai-unavailable")).toBeNull();
    expect(screen.getAllByText(/Reach 40 enterprise accounts/).length).toBeGreaterThan(0);
  });

  it("speaks Arabic when the app does", async () => {
    await openBuilder({ lang: "ar" });
    aiPost.mockResolvedValue({ response: THE_BUG });
    await sendMessage();

    const card = await screen.findByTestId("ai-unavailable");
    expect(card).toHaveAttribute("dir", "rtl");
    expect(screen.getByText(aiFailureCopy("unavailable", "ar").title)).toBeInTheDocument();
  });
});

describe("StrategyWizard — our scaffolding stays off their screen", () => {
  it("askForStrategy shows one sentence and sends the full template", async () => {
    await openBuilder();
    // Prose first: the generate button only shows while nothing is captured.
    aiPost.mockResolvedValue({ response: "Understood. Tell me more about your market." });
    await sendMessage("Some context about our goals");
    await screen.findByText(/Understood. Tell me more/);

    aiPost.mockClear();
    aiPost.mockResolvedValue({ response: REAL_OUTPUT });
    await act(async () => {
      fireEvent.click(screen.getByText(/Ask AI to generate the staircase now/));
    });

    // What the client reads.
    expect(
      await screen.findByText("Generate the full staircase from everything we've discussed."),
    ).toBeInTheDocument();

    // What the model receives.
    const sent = aiPost.mock.calls[0][1].message;
    expect(sent).toContain("[Vision]:");
    expect(sent).toContain("[Objective 1]:");
    expect(sent).toContain("[KR 1.1]:");
    expect(sent).toContain("Be specific and tailored to this marketing strategy context.");
  });

  it("never paints the template into the input box", async () => {
    await openBuilder();
    aiPost.mockResolvedValue({ response: "Understood. Tell me more about your market." });
    await sendMessage("Some context");
    await screen.findByText(/Understood. Tell me more/);

    await act(async () => {
      fireEvent.click(screen.getByText(/Ask AI to generate the staircase now/));
    });

    expect(screen.getByPlaceholderText(/Describe your goals/).value).toBe("");
    expect(document.body.textContent).not.toContain("Format:");
    expect(document.body.textContent).not.toContain("[Objective 1]: ...");
  });

  it("keeps the [CONTEXT: …] wrapper out of the client's own bubble", async () => {
    await openBuilder();
    aiPost.mockResolvedValue({ response: REAL_OUTPUT });
    await sendMessage("We want to expand across the MENA region");

    expect(await screen.findByText("We want to expand across the MENA region")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("[CONTEXT:");
    expect(aiPost.mock.calls[0][1].message).toContain("[CONTEXT:");
  });
});
