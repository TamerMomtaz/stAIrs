/**
 * A client should never learn which model answered them, how many tokens it
 * cost, which internal agent did the work, or how often any of it fails.
 * Those numbers exist to debug the product.
 *
 * The rule lives in one place — canSeeAgentTelemetry() — and this file pins
 * every surface that was printing plumbing to whoever happened to be logged in.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { api, canSeeAgentTelemetry } from "../api";
import { AgentActivityIndicator, ConfidenceBadge } from "../components/SharedUI";
import { AIChatView } from "../components/AIChatView";

const asRole = (role) => { api.user = role ? { id: "u1", email: "a@b.c", role } : null; };

beforeEach(() => { localStorage.clear(); asRole(null); });
afterEach(() => { cleanup(); asRole(null); });

describe("canSeeAgentTelemetry", () => {
  it("admits admin and owner, matching the backend's own check", () => {
    asRole("admin"); expect(canSeeAgentTelemetry()).toBe(true);
    asRole("owner"); expect(canSeeAgentTelemetry()).toBe(true);
  });

  it("refuses members, viewers and anyone not signed in", () => {
    asRole("member"); expect(canSeeAgentTelemetry()).toBe(false);
    asRole("viewer"); expect(canSeeAgentTelemetry()).toBe(false);
    asRole(null);     expect(canSeeAgentTelemetry()).toBe(false);
  });
});

describe("<AgentActivityIndicator /> — the loading line", () => {
  it("tells a client what is happening to their strategy, naming no agents", () => {
    asRole("member");
    for (const step of [0, 1, 2]) {
      cleanup();
      render(<AgentActivityIndicator agentStep={step} />);
      const text = screen.getByTestId("agent-activity-indicator").textContent;
      expect(text).not.toMatch(/analyst|validation agent/i);
      expect(text).toMatch(/your sources|your strategy|the answer/i);
    }
  });

  it("still names the agent for an admin, which is the version worth reading", () => {
    asRole("admin");
    render(<AgentActivityIndicator agentStep={0} />);
    expect(screen.getByTestId("agent-activity-indicator").textContent).toMatch(/Document Analyst/);
  });
});

describe("<ConfidenceBadge /> — the tooltip", () => {
  const validation = { confidence_score: 88, warnings: ["Thin evidence on pricing"], contradictions: [] };
  const agents = [{ name: "strategy_advisor", role: "scores the plan" }];

  it("keeps the score and the warnings for a client — those describe the answer", () => {
    asRole("member");
    render(<ConfidenceBadge validation={validation} agentsUsed={agents} />);
    fireEvent.click(screen.getByTestId("confidence-badge"));
    const tip = screen.getByTestId("confidence-tooltip");
    expect(tip.textContent).toContain("88%");
    expect(tip.textContent).toContain("Thin evidence on pricing");
    expect(tip.textContent).not.toContain("Agents involved");
    expect(tip.textContent).not.toContain("strategy_advisor");
  });

  it("lists the agents for an admin", () => {
    asRole("admin");
    render(<ConfidenceBadge validation={validation} agentsUsed={agents} />);
    fireEvent.click(screen.getByTestId("confidence-badge"));
    expect(screen.getByTestId("confidence-tooltip").textContent).toContain("strategy_advisor");
  });
});

describe("AI Advisor message footer", () => {
  // One saved conversation carrying every piece of plumbing at once.
  const seed = () => {
    localStorage.setItem("stairs_c_u1_l", JSON.stringify([{ id: "c1", title: "Risks", count: 2 }]));
    localStorage.setItem("stairs_c_u1_a", "c1");
    localStorage.setItem("stairs_c_u1_m_c1", JSON.stringify([
      { role: "user", text: "What are the biggest risks?" },
      {
        role: "ai", text: "Three stand out.",
        provider_display: "Anthropic", tokens: 1847,
        agents_used: [{ name: "strategy_advisor" }],
        validation: { confidence_score: 88, warnings: [], contradictions: [] },
      },
    ]));
  };

  it("gives a client the answer and the confidence, and no plumbing", () => {
    asRole("member"); seed();
    const { container } = render(<AIChatView lang="en" userId="u1" />);
    expect(screen.getByText("Three stand out.")).toBeInTheDocument();
    expect(screen.getByTestId("confidence-badge")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Anthropic");
    expect(container.textContent).not.toContain("1847");
    expect(container.textContent).not.toMatch(/\btokens\b/);
    expect(container.textContent).not.toMatch(/\d+ agents?\b/);
  });

  it("gives an admin the provider, the token count and the agent count", () => {
    asRole("admin"); seed();
    const { container } = render(<AIChatView lang="en" userId="u1" />);
    expect(container.textContent).toContain("Anthropic");
    expect(container.textContent).toContain("1847 tokens");
    expect(container.textContent).toContain("1 agent");
  });
});
