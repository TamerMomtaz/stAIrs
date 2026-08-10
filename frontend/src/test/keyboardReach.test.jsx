/**
 * The controls a keyboard can now reach.
 * ──────────────────────────────────────
 * The affordance audit's category C: a <div> with an onClick and nothing
 * else. A mouse works. Tab skips it, Enter and Space do nothing, and a
 * screen reader announces no role, so it is not a control at all to anyone
 * not holding a mouse. There were eight, on the paths a client uses most —
 * picking a strategy, opening a step, choosing a conversation.
 *
 * Static analysis cannot close this. It can see that role="button" and an
 * onKeyDown now exist; it cannot see whether pressing Enter does the thing
 * the click does. That gap is exactly #73's — a handler that exists and
 * throws passes every check we had — so these press real keys against the
 * real app with the network boundary mocked and nothing else, and assert on
 * what actually happened.
 *
 * The Escape half is the same bug wearing the other hat: an overlay whose
 * only exit is clicking a scrim is an overlay a keyboard cannot leave.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { TUTORIAL_VERSION, TUTORIAL_STORAGE_KEY } from '../tutorialConfig';

const listStrategies = vi.fn();
const getPath = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    api: {
      user: { id: 'u1', email: 'client@acme.co', full_name: 'Client', role: 'member' },
      get: (...a) => getPath(...a),
      post: vi.fn(() => Promise.resolve({})),
      put: vi.fn(() => Promise.resolve({})),
      del: vi.fn(() => Promise.resolve({})),
      aiPost: vi.fn(() => Promise.resolve({})),
      setOnAuthExpired: vi.fn(),
      logout: vi.fn(),
    },
    StrategyAPI: class { list() { return listStrategies(); } },
    ActionPlansAPI: {
      getForStair: vi.fn(() => Promise.resolve([])),
      getForStrategy: vi.fn(() => Promise.resolve([])),
      save: vi.fn(() => Promise.resolve({})),
      updateTaskDone: vi.fn(() => Promise.resolve({})),
    },
    ArtifactsAPI: {
      ...actual.ArtifactsAPI,
      forStair: vi.fn(() => Promise.resolve([])),
      forStrategy: vi.fn(() => Promise.resolve([])),
    },
    SourcesAPI: { ...actual.SourcesAPI, count: vi.fn(() => Promise.resolve({ count: 0 })) },
    NotesAPI: { ...actual.NotesAPI, create: vi.fn(() => Promise.resolve({})), list: vi.fn(() => Promise.resolve([])) },
    syncLocalNotes: vi.fn(() => Promise.resolve({ uploaded: 0, failed: 0 })),
    canSeeAgentTelemetry: () => false,
  };
});

const { default: App } = await import('../StairsApp');

const STRATEGY = { id: 'strat-1', name: 'marketing and sales', icon: '📈', company: 'Acme', industry: 'SaaS' };
const STAIR = {
  id: 'stair-1', title: 'Grow qualified pipeline 40%', code: 'OBJ-2608-A9C9',
  element_type: 'objective', health: 'at_risk', progress_percent: 45,
};
const TREE = [{ stair: STAIR, children: [] }];

const at = (h) => window.history.replaceState(null, '', h);
const hash = () => window.location.hash;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
    completedVersion: TUTORIAL_VERSION, completedStepIds: [], featuresUsed: [], dismissed: false,
  }));
  vi.clearAllMocks();
  listStrategies.mockResolvedValue([STRATEGY]);
  getPath.mockImplementation((path) => {
    if (path === '/api/v1/strategies/strat-1/tree') return Promise.resolve(TREE);
    if (path === '/api/v1/dashboard') return Promise.resolve({});
    if (path === '/api/v1/alerts') return Promise.resolve([]);
    return Promise.resolve(null);
  });
});

afterEach(() => { cleanup(); at('/'); });

describe('category C — controls a keyboard can reach', () => {
  it('opens a strategy with Enter on its card, not just with a click', async () => {
    at('/#/');
    render(<App />);

    const card = await screen.findByRole('button', { name: /marketing and sales/i });
    expect(card).toHaveAttribute('tabindex', '0');

    // The real assertion: the key does what the click does. A role and a
    // tabIndex with no key handler would pass a static sweep and fail here.
    card.focus();
    fireEvent.keyDown(card, { key: 'Enter' });

    await waitFor(() => expect(hash()).toMatch(/^#\/s\/strat-1\b/));
  });

  it('opens a strategy with Space too, without scrolling the page', async () => {
    at('/#/');
    render(<App />);
    const card = await screen.findByRole('button', { name: /marketing and sales/i });

    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    card.focus();
    card.dispatchEvent(ev);

    await waitFor(() => expect(hash()).toMatch(/^#\/s\/strat-1\b/));
    // Space on a focused control must not also scroll — the handler owes a
    // preventDefault, and this is the only place that can catch its absence.
    expect(ev.defaultPrevented).toBe(true);
  });

  it('expands a staircase step with Enter', async () => {
    at('/#/s/strat-1/staircase');
    render(<App />);

    const row = await screen.findByRole('button', { name: /Grow qualified pipeline 40%/i });
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });

    // Expanding reveals the step's own actions, which do not exist collapsed.
    // Scoped to the step's card: the sidebar names Execution Room too, and a
    // bare screen query matches the nav item and passes while the row is dead.
    const card = within(row.parentElement);
    await waitFor(() => expect(card.getByRole('button', { name: /Execution Room/i })).toBeInTheDocument());
  });

  it('announces the step as a control, with a name a screen reader can read', async () => {
    at('/#/s/strat-1/staircase');
    render(<App />);
    const row = await screen.findByRole('button', { name: /Grow qualified pipeline 40%/i });
    expect(row).toHaveAttribute('role', 'button');
    expect(row).toHaveAttribute('tabindex', '0');
  });
});

describe('category C — overlays a keyboard can leave', () => {
  it('closes the profile menu with Escape', async () => {
    at('/#/s/strat-1/staircase');
    render(<App />);

    const header = within(await screen.findByTestId('app-header'));
    fireEvent.click(header.getByText(/client@acme.co|Client/i).closest('button'));
    expect(await screen.findByTestId('open-password')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('open-password')).toBeNull());
  });

  it('leaves the menu alone for any other key', async () => {
    at('/#/s/strat-1/staircase');
    render(<App />);
    const header = within(await screen.findByTestId('app-header'));
    fireEvent.click(header.getByText(/client@acme.co|Client/i).closest('button'));
    await screen.findByTestId('open-password');

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'Tab' });

    expect(screen.getByTestId('open-password')).toBeInTheDocument();
  });
});
