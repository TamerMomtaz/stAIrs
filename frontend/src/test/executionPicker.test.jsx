/**
 * The Execution Room is the only screen where work happens and was the only
 * screen not in the nav, while its two read-only outputs were. The picker is
 * the missing piece: a stable destination that answers "what should I work on
 * next" rather than a menu on the way to somewhere else.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const loadSavedWork = vi.fn();
vi.mock("../lib/savedWork", async (orig) => ({ ...(await orig()), loadSavedWork: (...a) => loadSavedWork(...a) }));

import { ExecutionPicker } from "../components/ExecutionPicker";
import { mostRecentlyWorked, flattenTree } from "../lib/savedWork";

const step = (id, title, over = {}) => ({
  stair: { id, title, code: `OBJ-00${id}`, element_type: "objective", health: "on_track", progress_percent: 40, ...over },
  children: [],
});
const TREE = [step(1, "Enter the UAE market"), step(2, "Double ARR"), step(3, "Hire a regional lead")];

const picker = (over = {}) => (
  <ExecutionPicker tree={TREE} strategyContext={{ id: "s1" }} lang="en" onOpen={() => {}} {...over} />
);

beforeEach(() => loadSavedWork.mockReset());
afterEach(cleanup);

describe("what the picker tells you", () => {
  it("lists every step in staircase order", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker());
    await waitFor(() => expect(screen.getAllByTestId("picker-step")).toHaveLength(3));
    const titles = screen.getAllByTestId("picker-step").map(b => b.textContent);
    expect(titles[0]).toContain("Enter the UAE market");
    expect(titles[2]).toContain("Hire a regional lead");
  });

  it("says how much work is banked against each step, not just that it exists", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {
      "1": { total: 5, withWork: 3, lastWorkedAt: null },
      "2": { total: 4, withWork: 0, lastWorkedAt: null },
      "3": { total: 2, withWork: 2, lastWorkedAt: null },
    }});
    render(picker());
    await waitFor(() => expect(screen.getByText(/3 of 5 actions have saved work/)).toBeInTheDocument());
    expect(screen.getByText(/4 actions, none worked yet/)).toBeInTheDocument();
    expect(screen.getByText(/All 2 actions have saved work/)).toBeInTheDocument();
  });

  it("says so plainly when a step has no plan at all", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker());
    await waitFor(() => expect(screen.getAllByText("No action plan yet")).toHaveLength(3));
  });
});

describe("resuming", () => {
  it("pins the most recently worked step above the list", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {
      "1": { total: 5, withWork: 1, lastWorkedAt: "2026-08-01T10:00:00Z" },
      "2": { total: 4, withWork: 2, lastWorkedAt: "2026-08-07T10:00:00Z" },
    }});
    render(picker());
    await waitFor(() => expect(screen.getByTestId("picker-resume-block")).toBeInTheDocument());
    expect(screen.getByText("Continue where you left off")).toBeInTheDocument();
    expect(screen.getByTestId("picker-resume").textContent).toContain("Double ARR");
  });

  it("offers no resume card on a strategy nobody has worked yet", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: { "1": { total: 3, withWork: 0, lastWorkedAt: null } } });
    render(picker());
    await waitFor(() => expect(screen.getAllByTestId("picker-step")).toHaveLength(3));
    expect(screen.queryByTestId("picker-resume-block")).toBeNull();
  });

  it("opens the room for the step you click", async () => {
    const onOpen = vi.fn();
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker({ onOpen }));
    await waitFor(() => expect(screen.getAllByTestId("picker-step")).toHaveLength(3));
    fireEvent.click(screen.getAllByTestId("picker-step")[1]);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: "Double ARR" }));
  });
});

describe("when things are missing or broken", () => {
  it("points at the staircase when there are no steps to work on", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker({ tree: [] }));
    expect(await screen.findByText("No steps to work on yet")).toBeInTheDocument();
    expect(screen.getByText(/Build your staircase first/)).toBeInTheDocument();
  });

  it("distinguishes a failed step load from an empty strategy", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker({ tree: [], treeFailed: true, onRetryTree: () => {} }));
    expect(await screen.findByTestId("load-failed")).toBeInTheDocument();
    expect(screen.queryByText("No steps to work on yet")).toBeNull();
  });

  it("keeps its heading in every state", async () => {
    loadSavedWork.mockResolvedValue({ results: {}, stamps: {}, counts: {} });
    render(picker({ tree: [] }));
    expect(await screen.findByRole("heading", { name: "Execution Room" })).toBeInTheDocument();
  });
});

describe("savedWork helpers", () => {
  it("mostRecentlyWorked picks the latest, ignoring steps never worked", () => {
    expect(mostRecentlyWorked({
      a: { lastWorkedAt: "2026-01-01T00:00:00Z" },
      b: { lastWorkedAt: null },
      c: { lastWorkedAt: "2026-06-01T00:00:00Z" },
    })).toMatchObject({ stairId: "c" });
    expect(mostRecentlyWorked({})).toBeNull();
    expect(mostRecentlyWorked({ a: { lastWorkedAt: null } })).toBeNull();
  });

  it("flattenTree keeps staircase order and records depth", () => {
    const tree = [{ stair: { id: 1 }, children: [{ stair: { id: 2 }, children: [{ stair: { id: 3 }, children: [] }] }] }, { stair: { id: 4 }, children: [] }];
    expect(flattenTree(tree).map(n => [n.stair.id, n.depth])).toEqual([[1, 0], [2, 1], [3, 2], [4, 0]]);
  });
});
