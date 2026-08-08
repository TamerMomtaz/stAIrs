import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import AiUnavailable from "../components/AiUnavailable";
import { aiFailureCopy } from "../lib/aiResilience";

afterEach(cleanup);

// ═══════════════════════════════════════════════════════════════════
// <AiUnavailable /> — the bubble the client actually reads
// ═══════════════════════════════════════════════════════════════════

describe("<AiUnavailable />", () => {
  it("shows calm copy, never a status code", () => {
    render(<AiUnavailable kind="unavailable" />);
    expect(screen.getByText(aiFailureCopy("unavailable").title)).toBeInTheDocument();
    const card = screen.getByTestId("ai-unavailable");
    expect(card.textContent).not.toMatch(/\d{3}/);
    expect(card.textContent).not.toMatch(/anthropic|claude-|HTTP/i);
  });

  it("reassures the client that nothing was lost", () => {
    render(<AiUnavailable kind="busy" />);
    expect(screen.getByText(/Your inputs are saved/)).toBeInTheDocument();
  });

  it("offers Try again and Continue manually when handlers are given", () => {
    const onRetry = vi.fn();
    const onContinueManually = vi.fn();
    render(<AiUnavailable onRetry={onRetry} onContinueManually={onContinueManually} />);
    fireEvent.click(screen.getByText("Try again"));
    fireEvent.click(screen.getByText("Continue manually"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onContinueManually).toHaveBeenCalledTimes(1);
  });

  it("hides the actions it has no handler for", () => {
    render(<AiUnavailable />);
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.queryByText("Continue manually")).toBeNull();
  });

  it("disables retry while a retry is in flight", () => {
    render(<AiUnavailable onRetry={() => {}} retrying />);
    expect(screen.getByText("…").closest("button")).toBeDisabled();
  });

  it("renders Arabic copy right-to-left", () => {
    render(<AiUnavailable kind="unavailable" lang="ar" onRetry={() => {}} />);
    const card = screen.getByTestId("ai-unavailable");
    expect(card).toHaveAttribute("dir", "rtl");
    expect(screen.getByText(aiFailureCopy("unavailable", "ar").title)).toBeInTheDocument();
    expect(screen.getByText("إعادة المحاولة")).toBeInTheDocument();
  });

  it("is gold on glass, not a red error box", () => {
    render(<AiUnavailable />);
    const style = screen.getByTestId("ai-unavailable").getAttribute("style");
    expect(style.replace(/\s+/g, "")).toContain("rgba(184,144,74,0.06)");
    expect(style).not.toMatch(/red|#f8|#dc2/i);
  });

  it("carries every failure kind through to its own copy", () => {
    for (const kind of ["busy", "unavailable", "offline", "too_long", "session"]) {
      cleanup();
      render(<AiUnavailable kind={kind} />);
      expect(screen.getByTestId("ai-unavailable")).toHaveAttribute("data-kind", kind);
      expect(screen.getByText(aiFailureCopy(kind).title)).toBeInTheDocument();
    }
  });
});
