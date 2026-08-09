import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseHash, formatHash, go, DEFAULT_VIEW, ROUTABLE_VIEWS } from "../lib/urlState";

/* The URL is the app's only record of where you are, so these are the tests
   that stop a refresh dropping someone at the picker again. */

describe("reading a URL", () => {
  it("treats a bare hash as the strategy picker", () => {
    for (const h of ["", "#", "#/", "/"]) {
      expect(parseHash(h).strategyId, h).toBeNull();
    }
  });

  it("reads a strategy and a view", () => {
    expect(parseHash("#/s/abc123/staircase")).toEqual({
      strategyId: "abc123", view: "staircase", roomStairId: null,
    });
  });

  it("defaults the view when the hash names only a strategy", () => {
    expect(parseHash("#/s/abc123").view).toBe(DEFAULT_VIEW);
  });

  it("falls back to the default view rather than rendering nothing for an unknown one", () => {
    // A typo in a pasted link is a bad link, not a screen worth building.
    expect(parseHash("#/s/abc123/nonsense").view).toBe(DEFAULT_VIEW);
    expect(parseHash("#/s/abc123/nonsense").strategyId).toBe("abc123");
  });

  it("reads a room link, and keeps the picker underneath it", () => {
    const r = parseHash("#/s/abc123/room/stair-9");
    expect(r).toEqual({ strategyId: "abc123", view: "execroom", roomStairId: "stair-9" });
  });

  it("sends a room link with no step to the picker, which is the screen that asks which step", () => {
    expect(parseHash("#/s/abc123/room")).toEqual({
      strategyId: "abc123", view: "execroom", roomStairId: null,
    });
  });

  it("survives ids that need encoding", () => {
    expect(parseHash("#/s/" + encodeURIComponent("a/b c") + "/staircase").strategyId).toBe("a/b c");
  });

  it("accepts every view the sidebar can reach", () => {
    for (const v of ROUTABLE_VIEWS) expect(parseHash(`#/s/x/${v}`).view, v).toBe(v);
  });
});

describe("writing a URL", () => {
  it("round-trips", () => {
    for (const r of [
      { strategyId: null, view: DEFAULT_VIEW, roomStairId: null },
      { strategyId: "s1", view: "alerts", roomStairId: null },
      { strategyId: "s1", view: "execroom", roomStairId: "n2" },
    ]) {
      expect(parseHash(formatHash(r))).toEqual(r);
    }
  });

  it("writes the picker as #/", () => {
    expect(formatHash({ strategyId: null })).toBe("#/");
  });

  it("prefers the room segment over the view, because the room IS the place", () => {
    expect(formatHash({ strategyId: "s1", view: "dashboard", roomStairId: "n2" }))
      .toBe("#/s/s1/room/n2");
  });
});

describe("navigating", () => {
  beforeEach(() => {
    // relative, so jsdom keeps it same-origin
    window.history.replaceState(null, "", "/?invite=tok");
    vi.spyOn(window.history, "pushState");
    vi.spyOn(window.history, "replaceState");
  });
  afterEach(() => vi.restoreAllMocks());

  it("pushes, so Back has somewhere to go", () => {
    go({ strategyId: "s1", view: "staircase" });
    expect(window.history.pushState).toHaveBeenCalled();
    expect(window.location.hash).toBe("#/s/s1/staircase");
  });

  it("keeps the query string, because ?invite= and ?reset= links are live", () => {
    go({ strategyId: "s1", view: "staircase" });
    expect(window.location.search).toBe("?invite=tok");
  });

  it("replaces rather than pushes when the app is correcting itself", () => {
    // The real scenario: you opened a link to a strategy that is gone, and the
    // app sends you to the picker. That correction should not cost a Back press.
    window.history.replaceState(null, "", "/#/s/deleted-999/dashboard");
    window.history.pushState.mockClear();
    window.history.replaceState.mockClear();
    go({ strategyId: null }, { replace: true });
    expect(window.history.replaceState).toHaveBeenCalled();
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/");
  });

  it("does nothing when the destination is where you already are", () => {
    go({ strategyId: "s1", view: "staircase" });
    window.history.pushState.mockClear();
    go({ strategyId: "s1", view: "staircase" });
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
});
