/**
 * The letterhead logo used to be an inline data URI, decoded before print()
 * was ever reached. It is a fetched file now, so printing the instant the
 * markup is written can put a broken image where the branding should be.
 *
 * Every export path in the app goes through printDocument(), so this is the
 * one place that has to get the wait right.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { printDocument, logoUrl, DEVONEERS_LOGO_PATH } from "../exportUtils";

// A stand-in for the popup: jsdom's window.open returns null, and we need to
// drive image load events by hand anyway.
const fakeWindow = (images = []) => {
  const timers = [];
  return {
    document: { write: vi.fn(), close: vi.fn(), images },
    focus: vi.fn(),
    print: vi.fn(),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    _fireTimers: () => timers.forEach(t => t.fn()),
  };
};

const image = (complete) => {
  const handlers = {};
  return {
    complete,
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
    fire: (ev) => handlers[ev] && handlers[ev](),
  };
};

describe("logoUrl", () => {
  it("is origin-absolute, because a print window's base URL is inherited, not set", () => {
    expect(logoUrl()).toBe(`${window.location.origin}${DEVONEERS_LOGO_PATH}`);
    expect(logoUrl().startsWith("http")).toBe(true);
  });

  it("is a file path, not a data URI", () => {
    expect(logoUrl()).not.toContain("base64");
    expect(DEVONEERS_LOGO_PATH).toBe("/devoneers-logo.png");
  });
});

describe("printDocument", () => {
  let w;
  beforeEach(() => { w = null; });

  it("writes the document and closes it", () => {
    w = fakeWindow();
    printDocument(w, "<html><body>hi</body></html>");
    expect(w.document.write).toHaveBeenCalledWith("<html><body>hi</body></html>");
    expect(w.document.close).toHaveBeenCalled();
  });

  it("prints immediately when there is nothing to wait for", () => {
    w = fakeWindow([]);
    printDocument(w, "<html></html>");
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("prints immediately when every image is already decoded", () => {
    w = fakeWindow([image(true), image(true)]);
    printDocument(w, "<html></html>");
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("holds the dialog until a pending image has loaded", () => {
    const logo = image(false);
    w = fakeWindow([logo]);
    printDocument(w, "<html></html>");
    expect(w.print).not.toHaveBeenCalled();   // <- the regression this guards
    logo.fire("load");
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("waits for the last of several images, not the first", () => {
    const a = image(false), b = image(false);
    w = fakeWindow([a, b, image(true)]);
    printDocument(w, "<html></html>");
    a.fire("load");
    expect(w.print).not.toHaveBeenCalled();
    b.fire("load");
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("still prints when an image 404s — a missing logo beats no PDF", () => {
    const logo = image(false);
    w = fakeWindow([logo]);
    printDocument(w, "<html></html>");
    logo.fire("error");
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("gives up waiting after the timeout rather than hanging", () => {
    w = fakeWindow([image(false)]);
    printDocument(w, "<html></html>");
    expect(w.print).not.toHaveBeenCalled();
    w._fireTimers();
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("prints once, however many things resolve", () => {
    const logo = image(false);
    w = fakeWindow([logo]);
    printDocument(w, "<html></html>");
    logo.fire("load");
    logo.fire("error");
    w._fireTimers();
    expect(w.print).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when the popup was blocked", () => {
    expect(() => printDocument(null, "<html></html>")).not.toThrow();
  });
});
