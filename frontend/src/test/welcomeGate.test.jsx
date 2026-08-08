/**
 * hasSeenWelcome() and markWelcomeSeen() were written, exported and
 * unit-tested — and called by nothing, so nine slides played on every single
 * app open. And every slide is English, which made it a worse first
 * impression in Arabic than no slideshow at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StrategyLanding } from "../components/StrategyLanding";
import { markWelcomeSeen } from "../components/WelcomeSlideshow";

const landing = (over = {}) => (
  <StrategyLanding
    strategies={[]} onSelect={() => {}} onCreate={() => {}} onDelete={() => {}}
    userName="Tamer" onLogout={() => {}} onLangToggle={() => {}}
    lang="en" loading={false} userId="u1" userEmail="t@d.c" userRole="member"
    {...over}
  />
);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the welcome slideshow decides whether to appear", () => {
  it("plays for someone who has never seen it", () => {
    render(landing());
    expect(screen.getByTestId("welcome-slideshow")).toBeInTheDocument();
  });

  it("stays shut for someone who has", () => {
    markWelcomeSeen("u1");
    render(landing());
    expect(screen.queryByTestId("welcome-slideshow")).toBeNull();
  });

  it("remembers per user, not per browser", () => {
    markWelcomeSeen("u1");
    render(landing({ userId: "u2" }));
    expect(screen.getByTestId("welcome-slideshow")).toBeInTheDocument();
  });

  it("waits until the strategy list has loaded", () => {
    render(landing({ loading: true }));
    expect(screen.queryByTestId("welcome-slideshow")).toBeNull();
  });
});

describe("an Arabic session is not shown an English slideshow", () => {
  it("doesn't auto-play, even for a first-time user", () => {
    render(landing({ lang: "ar" }));
    expect(screen.queryByTestId("welcome-slideshow")).toBeNull();
  });

  it("doesn't offer Watch Intro either — the content behind it is English", () => {
    render(landing({ lang: "ar" }));
    expect(screen.queryByTestId("watch-intro-btn")).toBeNull();
  });

  it("still offers it in English", () => {
    markWelcomeSeen("u1");
    render(landing());
    expect(screen.getByTestId("watch-intro-btn")).toBeInTheDocument();
  });
});
