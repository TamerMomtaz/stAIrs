import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import AiUnavailable from "../components/AiUnavailable";
import { Modal } from "../components/SharedUI";
import { aiFailureCopy } from "../lib/aiResilience";
import { inputCls, labelCls } from "../constants";

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

// ═══════════════════════════════════════════════════════════════════
// <Modal /> sizing
// ═══════════════════════════════════════════════════════════════════

describe("<Modal /> sizing", () => {
  const open = (props) => render(<Modal open onClose={() => {}} title="T" {...props}><p>body</p></Modal>);
  const panel = () => document.querySelector("[data-modal-size]");

  it("defaults to sm", () => {
    open({});
    expect(panel().dataset.modalSize).toBe("sm");
    expect(panel().className).toContain("max-w-lg");
    expect(panel().className).toContain("max-h-[88vh]");
  });

  it("keeps the legacy `wide` prop working as an alias for lg", () => {
    open({ wide: true });
    expect(panel().dataset.modalSize).toBe("lg");
    expect(panel().className).toContain("max-w-4xl");
  });

  it("lets size override, and size wins over wide", () => {
    open({ size: "full", wide: true });
    expect(panel().dataset.modalSize).toBe("full");
  });

  it("size=full fills the screen with no max-width or max-height cap", () => {
    open({ size: "full" });
    const cls = panel().className;
    expect(cls).toContain("md:inset-[2.5%]");
    expect(cls).toContain("max-w-none");
    expect(cls).toContain("max-h-none");
    expect(cls).toContain("w-auto");
    expect(cls).toContain("h-auto");
    // Full bleed below md.
    expect(cls).toContain("inset-0");
    expect(cls).toContain("rounded-none");
    // Exactly one position utility, so there is no relative/fixed fight.
    expect(cls).toContain("fixed");
    expect(cls).not.toContain("relative");
  });

  it("gives the body the whole panel and pins header and footer", () => {
    render(
      <Modal open onClose={() => {}} title="T" size="full" footer={<button>Save</button>}>
        <p>body</p>
      </Modal>,
    );
    const p = panel();
    expect(p.className).toContain("flex");
    expect(p.className).toContain("flex-col");
    const [header, body, foot] = p.children;
    expect(header.className).toContain("flex-shrink-0");
    expect(body.className).toContain("flex-1");
    expect(body.className).toContain("min-h-0");
    expect(body.className).toContain("overflow-auto");
    expect(foot.className).toContain("flex-shrink-0");
  });

  it("renders no footer element when none is passed", () => {
    open({});
    expect(panel().children.length).toBe(2);
  });

  it("still renders nothing when closed, and still closes on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open={false} onClose={onClose} title="T"><p>hi</p></Modal>);
    expect(container.firstChild).toBeNull();

    cleanup();
    render(<Modal open onClose={onClose} title="T"><p>hi</p></Modal>);
    fireEvent.click(document.querySelector(".fixed.inset-0.z-\\[100\\]"));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when the panel itself is clicked", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T"><p>hi</p></Modal>);
    fireEvent.click(screen.getByText("hi"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Shared field sizing
// ═══════════════════════════════════════════════════════════════════

describe("shared field classes", () => {
  it("inputs are roomy, not cramped", () => {
    expect(inputCls).toContain("px-4");
    expect(inputCls).toContain("py-3.5");
    expect(inputCls).toContain("text-[15px]");
    expect(inputCls).toContain("rounded-xl");
    expect(inputCls).not.toContain("py-2.5");
    expect(inputCls).not.toContain("text-sm");
  });

  it("labels have room to breathe", () => {
    expect(labelCls).toContain("text-[11px]");
    expect(labelCls).toContain("tracking-[0.12em]");
    expect(labelCls).toContain("mb-2");
    expect(labelCls).toContain("font-medium");
  });
});
