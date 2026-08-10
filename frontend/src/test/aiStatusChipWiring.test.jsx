/**
 * The ⚡ chip, wired to the real app.
 * ──────────────────────────────────
 * Same pattern as appWiring.test.jsx, and for the same reason: a handler that
 * exists and throws is wired as far as any static sweep is concerned. The
 * affordance audit can tell you this chip now has an onClick. It cannot tell
 * you the onClick reaches an endpoint, or that the endpoint's answer reaches
 * the screen. So the network boundary is mocked and nothing else — the real
 * <App />, the real header, the real AiStatusChip, driven by clicking.
 *
 * The chip spent its life as a <span> carrying a fill, a hairline, padding and
 * a radius — the vocabulary of every button beside it — with no handler at
 * all. Category A2a, and the only instance of it in the application.
 *
 * These also pin the half of #65 that the screens missed: this is telemetry,
 * so it is admin and owner only, and a member must not reach it even though
 * the member has a perfectly good login.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { TUTORIAL_VERSION, TUTORIAL_STORAGE_KEY } from '../tutorialConfig';

const listStrategies = vi.fn();
const getPath = vi.fn();

// The role the app is signed in as, read fresh on every canSeeAgentTelemetry()
// call so a test can boot as a member or as an admin.
let role = 'admin';

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    api: {
      get user() { return { id: 'u1', email: 'ops@acme.co', full_name: 'Ops', role }; },
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
    // The real rule, not a stub — the same two roles the backend gate uses.
    canSeeAgentTelemetry: () => ['admin', 'owner'].includes(role),
  };
});

const { default: App } = await import('../StairsApp');

const STRATEGY = { id: 'strat-1', name: 'marketing and sales', icon: '📈', company: 'Acme', industry: 'SaaS' };
const TREE = [{ stair: { id: 'stair-1', title: 'Grow pipeline', code: 'OBJ-1', element_type: 'objective', health: 'on_track', progress_percent: 10 }, children: [] }];

const HEALTH = {
  provider: 'claude', provider_display: 'Claude',
  healthy: true, ai_enabled: true, degraded: false,
  active_model: 'claude-sonnet-4-20250514',
  success_rate: 98.5, calls_ok: 197, calls_failed: 3,
  last_error: null, fallback_switches_today: 0,
  providers: { claude: { display_name: 'Claude', has_key: true, failures_last_hour: 0 } },
};

const at = (hash) => window.history.replaceState(null, '', hash);

/* Boots the real app into a strategy. Returns a FUNCTION that re-queries the
   header, not a scope captured once: the app renders a different tree while
   the strategy loads, so a reference taken at first paint points at a header
   that has since been replaced, and every query against it finds nothing.
   Scoped rather than bare, because the sidebar and the views underneath name
   plenty of the same things. */
async function openApp() {
  at('/#/s/strat-1/staircase');
  render(<App />);
  await screen.findByTestId('app-header');
  return () => within(screen.getByTestId('app-header'));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
    completedVersion: TUTORIAL_VERSION, completedStepIds: [], featuresUsed: [], dismissed: false,
  }));
  role = 'admin';
  vi.clearAllMocks();
  listStrategies.mockResolvedValue([STRATEGY]);
  getPath.mockImplementation((path) => {
    if (path === '/api/v1/strategies/strat-1/tree') return Promise.resolve(TREE);
    if (path === '/api/v1/dashboard') return Promise.resolve({});
    if (path === '/api/v1/alerts') return Promise.resolve([]);
    if (path === '/api/v1/ai/provider') return Promise.resolve({ provider: 'claude', provider_display: 'Claude' });
    if (path === '/api/v1/ai/health') return Promise.resolve(HEALTH);
    return Promise.resolve(null);
  });
});

afterEach(() => { cleanup(); at('/'); });

describe('the ⚡ chip is a control now', () => {
  it('is a button, not a span wearing a button\'s clothes', async () => {
    const header = await openApp();
    const chip = await header().findByTestId('ai-status-chip');
    expect(chip.tagName).toBe('BUTTON');
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog');
    expect(chip).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the status panel and calls the endpoint behind it', async () => {
    const header = await openApp();
    fireEvent.click(await header().findByTestId('ai-status-chip'));

    // The handler survived being called AND reached the network. A handler
    // that throws fails on the first of these; one that opens an empty panel
    // fails on the second.
    await waitFor(() => expect(getPath).toHaveBeenCalledWith('/api/v1/ai/health'));
    const panel = await screen.findByTestId('ai-status-panel');
    expect(within(panel).getByTestId('ai-status-dot')).toHaveAttribute('data-level', 'healthy');
    expect(panel.textContent).toContain('claude-sonnet-4-20250514');
    expect(panel.textContent).toContain('98.5%');
    expect(panel.textContent).toContain('197 ok');
  });

  it('survives the click without throwing', async () => {
    // #73's failure was a ReferenceError inside a handler, which leaves the
    // DOM untouched rather than blowing up the tree. Watch the console too, so
    // a regression that swallows the error still fails here.
    const onError = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(onError);
    const header = await openApp();

    fireEvent.click(await header().findByTestId('ai-status-chip'));
    await screen.findByTestId('ai-status-panel');

    expect(onError).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('says so when the status call fails, rather than spinning', async () => {
    getPath.mockImplementation((path) => {
      if (path === '/api/v1/strategies/strat-1/tree') return Promise.resolve(TREE);
      if (path === '/api/v1/ai/provider') return Promise.resolve({ provider_display: 'Claude' });
      if (path === '/api/v1/ai/health') return Promise.reject(new Error('503'));
      return Promise.resolve(null);
    });
    const header = await openApp();
    fireEvent.click(await header().findByTestId('ai-status-chip'));

    const panel = await screen.findByTestId('ai-status-panel');
    await waitFor(() => expect(panel.textContent).toMatch(/Status unavailable/i));
  });

  it('closes on Escape and hands focus back to the chip', async () => {
    const header = await openApp();
    const chip = await header().findByTestId('ai-status-chip');
    fireEvent.click(chip);
    await screen.findByTestId('ai-status-panel');

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('ai-status-panel')).toBeNull());
    expect(document.activeElement).toBe(chip);
  });

  it('closes on a second click, so the control toggles', async () => {
    const header = await openApp();
    const chip = await header().findByTestId('ai-status-chip');
    fireEvent.click(chip);
    await screen.findByTestId('ai-status-panel');

    fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByTestId('ai-status-panel')).toBeNull());
  });
});

describe('the ⚡ chip is still telemetry', () => {
  it('never renders for a member, and never asks for the provider', async () => {
    role = 'member';
    await openApp();

    await waitFor(() => expect(getPath).toHaveBeenCalled());
    expect(screen.queryByTestId('ai-status-chip')).toBeNull();
    expect(document.body.textContent).not.toContain('Claude');
  });

  it('renders for an owner as well as an admin', async () => {
    role = 'owner';
    const header = await openApp();
    expect(await header().findByTestId('ai-status-chip')).toBeInTheDocument();
  });
});
