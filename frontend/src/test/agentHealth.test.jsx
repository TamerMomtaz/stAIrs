/**
 * failure_rate is the number that shows an outage before a client reports one.
 * It is no use sitting in the API payload — it has to reach the panel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const getAgentStats = vi.fn();
// The strip is admin-only now. Default the role to admin so the cases below
// keep testing what they were written to test — that failure_rate reaches the
// panel — and flip it explicitly in the visibility case at the bottom.
let isAdmin = true;
vi.mock("../api", () => ({
  AdminAPI: { getAgentStats: (...a) => getAgentStats(...a) },
  DataQaAPI: { getDataHealth: vi.fn(() => Promise.resolve(null)) },
  SourcesAPI: { count: vi.fn(() => Promise.resolve({ count: 0 })) },
  api: { get: vi.fn(() => Promise.resolve({})) },
  canSeeAgentTelemetry: () => isAdmin,
}));

import { DashboardView } from "../components/DashboardView";

const DATA = { stats: { total_elements: 3, overall_progress: 50 }, top_risks: [] };

const payload = (over = {}) => ({
  total_calls: 10,
  failed_calls: 0,
  failure_rate: 0,
  agents: { strategy_advisor: { total_calls: 10, failed_calls: 0, failure_rate: 0, avg_confidence: 88, scored_calls: 10, low_confidence_count: 0, validation_rejection_rate: 0 } },
  recent_activity: [
    { agent_name: "strategy_advisor", task_type: "chat", confidence_score: 88, model_used: "Claude", ok: true, timestamp: "2026-08-08T10:00:00Z" },
  ],
  ...over,
});

beforeEach(() => { getAgentStats.mockReset(); isAdmin = true; });
afterEach(cleanup);

describe("agent health strip", () => {
  it("shows the overall failure rate", async () => {
    getAgentStats.mockResolvedValue(payload());
    render(<DashboardView data={DATA} lang="en" />);
    const strip = await screen.findByTestId("agent-health");
    expect(strip.textContent).toContain("Failure rate");
    expect(strip.textContent).toContain("0%");
    expect(strip.textContent).toContain("0/10");
  });

  it("calls out the specific agent that is failing", async () => {
    getAgentStats.mockResolvedValue(payload({
      total_calls: 10,
      failed_calls: 4,
      failure_rate: 40,
      agents: {
        strategy_advisor: { total_calls: 8, failed_calls: 4, failure_rate: 50, avg_confidence: 88, scored_calls: 4, low_confidence_count: 0, validation_rejection_rate: 0 },
        execution_planner: { total_calls: 2, failed_calls: 0, failure_rate: 0, avg_confidence: null, scored_calls: 0, low_confidence_count: 0, validation_rejection_rate: 0 },
      },
    }));
    render(<DashboardView data={DATA} lang="en" />);
    const strip = await screen.findByTestId("agent-health");
    expect(strip.textContent).toContain("40%");
    expect(strip.textContent).toContain("4/10");
    expect(strip.textContent).toContain("strategy_advisor");
    expect(strip.textContent).toContain("50%");
    // A healthy agent doesn't earn a chip — the strip is for what's wrong.
    expect(strip.textContent).not.toContain("execution_planner");
  });

  it("marks a failed call in the activity table instead of naming a model", async () => {
    getAgentStats.mockResolvedValue(payload({
      failed_calls: 1, failure_rate: 100,
      agents: { strategy_advisor: { total_calls: 1, failed_calls: 1, failure_rate: 100, avg_confidence: null, scored_calls: 0, low_confidence_count: 0, validation_rejection_rate: 0 } },
      recent_activity: [
        { agent_name: "strategy_advisor", task_type: "chat", confidence_score: null, model_used: "unavailable", ok: false, timestamp: "2026-08-08T10:00:00Z" },
      ],
    }));
    render(<DashboardView data={DATA} lang="en" />);
    await screen.findByTestId("agent-activity-log");
    expect(screen.getByText("unavailable")).toBeInTheDocument();
    // no fabricated score for a call that never ran
    expect(screen.getByTestId("agent-activity-log").textContent).toContain("—");
  });

  it("renders nothing extra when the endpoint predates the ok column", async () => {
    getAgentStats.mockResolvedValue(payload({
      ok_column_available: false,
      recent_activity: [
        { agent_name: "strategy_advisor", task_type: "chat", confidence_score: 88, model_used: "Claude", ok: null, timestamp: "2026-08-08T10:00:00Z" },
      ],
    }));
    render(<DashboardView data={DATA} lang="en" />);
    const strip = await screen.findByTestId("agent-health");
    expect(strip.textContent).toContain("0%");
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("survives an endpoint that returns no agents block", async () => {
    getAgentStats.mockResolvedValue({ recent_activity: [
      { agent_name: "a", task_type: "chat", confidence_score: null, model_used: null, ok: null, timestamp: null },
    ] });
    render(<DashboardView data={DATA} lang="en" />);
    await screen.findByTestId("agent-activity-log");
    expect(screen.queryByTestId("agent-health")).toBeNull();
  });
});

describe("who the strip is for", () => {
  it("shows a client none of it, and never asks the endpoint", async () => {
    isAdmin = false;
    getAgentStats.mockResolvedValue(payload({ failed_calls: 4, failure_rate: 40 }));
    render(<DashboardView data={DATA} lang="en" />);
    // The dashboard itself still renders.
    expect(await screen.findByText("Total Elements")).toBeInTheDocument();
    expect(screen.queryByTestId("agent-activity-log")).toBeNull();
    expect(screen.queryByTestId("agent-health")).toBeNull();
    // Gated at the mount, so a client's dashboard doesn't even call an
    // endpoint that would 403 on them.
    expect(getAgentStats).not.toHaveBeenCalled();
  });

  it("shows an admin the failure rate and the model column", async () => {
    isAdmin = true;
    getAgentStats.mockResolvedValue(payload({ failed_calls: 4, failure_rate: 40 }));
    render(<DashboardView data={DATA} lang="en" />);
    expect((await screen.findByTestId("agent-health")).textContent).toContain("40%");
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });
});
