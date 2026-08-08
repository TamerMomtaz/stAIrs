/**
 * Every list view in the app used to turn a load failure into its empty state.
 * A blip on the connection and the dashboard reported 0% across 0 elements,
 * the staircase said "No elements yet" — and a client reasonably concluded
 * their strategy was gone.
 *
 * These tests pin the distinction: "we couldn't load it" and "there is nothing
 * here" are different screens, and the first one offers a way out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import LoadFailed from "../components/LoadFailed";
import { AlertsView } from "../components/AlertsView";
import { StaircaseView } from "../components/StaircaseView";

afterEach(cleanup);

describe("<LoadFailed />", () => {
  it("says nothing is lost — the sentence a client needs most", () => {
    render(<LoadFailed what="your staircase" />);
    const card = screen.getByTestId("load-failed");
    expect(card.textContent).toContain("We couldn't load your staircase");
    expect(card.textContent).toMatch(/Nothing has changed and nothing is lost/);
  });

  it("never shows a status code, a vendor or a stack trace", () => {
    render(<LoadFailed what="your dashboard" />);
    const text = screen.getByTestId("load-failed").textContent;
    expect(text).not.toMatch(/\b\d{3}\b/);
    expect(text).not.toMatch(/error|failed|exception|fetch|http/i);
  });

  it("speaks Arabic, and sets the direction with it", () => {
    render(<LoadFailed what="السلم" lang="ar" />);
    const card = screen.getByTestId("load-failed");
    expect(card).toHaveAttribute("dir", "rtl");
    expect(card.textContent).toContain("تعذّر تحميل السلم");
    expect(card.textContent).toContain("لم يتغيّر شيء");
  });

  it("offers a retry, and only when there's something to retry", () => {
    const onRetry = vi.fn();
    const { rerender } = render(<LoadFailed onRetry={onRetry} />);
    fireEvent.click(screen.getByTestId("load-failed-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<LoadFailed />);
    expect(screen.queryByTestId("load-failed-retry")).toBeNull();
  });

  it("disables the retry while one is in flight", () => {
    render(<LoadFailed onRetry={() => {}} retrying />);
    expect(screen.getByTestId("load-failed-retry")).toBeDisabled();
  });
});

describe("a failed load is not an empty account", () => {
  it("Alerts: says it couldn't load, not that there are no alerts", () => {
    const onRetry = vi.fn();
    render(<AlertsView alerts={[]} lang="en" failed onRetry={onRetry} />);
    expect(screen.getByTestId("load-failed")).toBeInTheDocument();
    expect(screen.queryByText("No active alerts")).toBeNull();
    fireEvent.click(screen.getByTestId("load-failed-retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("Alerts: still says 'no alerts' when the load actually succeeded", () => {
    render(<AlertsView alerts={[]} lang="en" failed={false} />);
    expect(screen.getByText("No active alerts")).toBeInTheDocument();
    expect(screen.queryByTestId("load-failed")).toBeNull();
  });

  it("Staircase: an outage doesn't invite you to add your first element", () => {
    render(<StaircaseView tree={[]} lang="en" failed onRetry={() => {}} onMove={() => {}} />);
    expect(screen.getByTestId("load-failed")).toBeInTheDocument();
    expect(screen.queryByText(/No elements yet/)).toBeNull();
  });

  it("Staircase: keeps the tree on screen and flags it as stale after a failed refresh", () => {
    const tree = [{ stair: { id: "1", title: "Grow revenue", element_type: "objective", code: "OBJ-001", progress_percent: 40, health: "on_track" }, children: [] }];
    render(<StaircaseView tree={tree} lang="en" failed onRetry={() => {}} onMove={() => {}} />);
    // The work stays visible — blanking it is what read as data loss.
    expect(screen.getByText("Grow revenue")).toBeInTheDocument();
    expect(screen.getByTestId("load-failed")).toBeInTheDocument();
  });

  it("every view keeps its heading through the failure", () => {
    render(<AlertsView alerts={[]} lang="en" failed onRetry={() => {}} />);
    expect(screen.getByRole("heading", { name: "Alerts" })).toBeInTheDocument();
  });
});
