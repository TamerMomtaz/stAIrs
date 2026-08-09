/**
 * Lives in its own file on purpose. Vitest attributes a rejection raised
 * inside a mount effect to whichever test is running, and with sibling tests
 * in the same file that attribution lands on the wrong one — the assertions
 * below all pass, but the run is reported red. Alone, the accounting is
 * clean. The behaviour under test is worth keeping, so it gets a file.
 */
import { it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const loadSavedWork = vi.fn();
vi.mock("../lib/savedWork", async (orig) => ({ ...(await orig()), loadSavedWork: (...a) => loadSavedWork(...a) }));

import { ExecutionPicker } from "../components/ExecutionPicker";

const step = (id, title) => ({ stair: { id, title, code: `OBJ-00${id}`, element_type: "objective", health: "on_track", progress_percent: 40 }, children: [] });
const TREE = [step(1, "Enter the UAE market"), step(2, "Double ARR"), step(3, "Hire a regional lead")];

afterEach(cleanup);

it("a failed saved-work lookup costs the annotations, not the steps", async () => {
  loadSavedWork.mockImplementation(() => Promise.reject(new Error("saved-work lookup down")));
  render(<ExecutionPicker tree={TREE} strategyContext={{ id: "s1" }} lang="en" onOpen={() => {}} />);

  await waitFor(() => expect(screen.getByTestId("load-failed")).toBeInTheDocument());
  // You can still open any step; and the outage is not dressed up as an
  // empty strategy, which is the failure mode this whole pass is about.
  expect(screen.getAllByTestId("picker-step")).toHaveLength(3);
  expect(screen.queryByText("No steps to work on yet")).toBeNull();
  expect(screen.queryByTestId("picker-resume-block")).toBeNull();
});
