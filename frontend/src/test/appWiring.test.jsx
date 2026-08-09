/**
 * The handlers the app actually passes.
 * ─────────────────────────────────────
 * Every other component suite in here renders a view with `vi.fn()` props and
 * asserts the view called its callback. That proves the COMPONENT is wired. It
 * proves nothing about the callback the APP hands it, and the gap between those
 * two is where a dead feature hides under a green suite.
 *
 * It hid there. #72 turned `execRoomStair` from useState into a value derived
 * from the hash and left one call to the deleted setter behind:
 *
 *     onOpenManifest={() => { setExecRoomStair(null); goToView("manifest"); }}
 *
 * `setExecRoomStair` was undefined from that commit onward, so every click on
 * the Manifest chip raised ReferenceError before reaching goToView and the
 * navigation never ran. No linter in the project, an error in an event handler
 * unmounts nothing, and savedWorkSignposting.test.jsx passes a vi.fn() — so
 * 365 tests stayed green over a control that threw on every click in
 * production.
 *
 * THE PATTERN. Mock the network boundary and nothing else. The real <App />,
 * the real StairsApp wiring, the real ExecutionRoom, driven by the hash the way
 * a person drives it, asserted on where the hash ends up. A handler that throws
 * fails these; a handler that navigates somewhere wrong fails these too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { TUTORIAL_VERSION, TUTORIAL_STORAGE_KEY } from '../tutorialConfig';

const listStrategies = vi.fn();
const getPath = vi.fn();
const plansForStair = vi.fn();
const artifactsForStair = vi.fn();

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
      getForStair: (...a) => plansForStair(...a),
      getForStrategy: vi.fn(() => Promise.resolve([])),
      save: vi.fn(() => Promise.resolve({})),
      updateTaskDone: vi.fn(() => Promise.resolve({})),
    },
    ArtifactsAPI: {
      ...actual.ArtifactsAPI,
      forStair: (...a) => artifactsForStair(...a),
      forStrategy: vi.fn(() => Promise.resolve([])),
      save: vi.fn(() => Promise.resolve({ generated_at: '2026-08-09T10:00:00Z' })),
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

// A saved plan is what puts saved work in the room, which is what makes the
// Manifest chip appear at all — it renders only when savedWorkCount > 0.
const SAVED_PLAN = {
  id: 'plan-1', plan_type: 'recommended', created_at: '2026-08-09T10:00:00Z',
  raw_text: '## Action Plan\n\n- **Task:** Open the top 30 accounts',
  tasks: [{ id: 't1', name: 'Open the top 30 accounts', owner: 'BD', timeline: '4 weeks', priority: 'High', details: '' }],
};

const at = (hash) => window.history.replaceState(null, '', hash);
const hash = () => window.location.hash;

/* Boots the real app into the Execution Room over a step, by URL — the deep
   link case, which is also the case with no history to go Back to. Returns
   once the room is on screen with its saved work loaded. */
async function openRoom({ lang = 'en' } = {}) {
  if (lang === 'ar') localStorage.setItem('stairs_lang', 'ar');
  at('/#/s/strat-1/room/stair-1');
  render(<App />);
  const room = await screen.findByTestId('execution-room');
  // The chip is gated on loaded saved work; wait for the plan to land so the
  // header under test is the fully populated one.
  await within(room).findByText(lang === 'ar' ? /الخطة محفوظة/ : /Plan saved/i);
  // Scoped, because the sidebar underneath the overlay names several of the
  // same destinations. A bare screen query would match the nav item and pass
  // while the room's own control stayed dead.
  return room;
}

beforeEach(() => {
  localStorage.clear();
  // Silence the first-run tutorial and the new-steps prompt; neither is under
  // test and both render over the header.
  localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
    completedVersion: TUTORIAL_VERSION, completedStepIds: [], featuresUsed: [], dismissed: false,
  }));
  vi.clearAllMocks();
  listStrategies.mockResolvedValue([STRATEGY]);
  plansForStair.mockResolvedValue([SAVED_PLAN]);
  artifactsForStair.mockResolvedValue([]);
  getPath.mockImplementation((path) => {
    if (path === '/api/v1/strategies/strat-1/tree') return Promise.resolve(TREE);
    if (path === '/api/v1/dashboard') return Promise.resolve({});
    if (path === '/api/v1/alerts') return Promise.resolve([]);
    if (path === '/api/v1/ai/provider') return Promise.resolve({ provider_display: 'Claude' });
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  at('/');
});

describe('the Execution Room header, wired to the real app', () => {
  it('opens the Manifest Room from the saved-work chip', async () => {
    const room = await openRoom();

    fireEvent.click(within(room).getByRole('button', { name: /Manifest Room/i }));

    await waitFor(() => expect(hash()).toBe('#/s/strat-1/manifest'));
    // The room closes because the hash stopped naming it — not because anyone
    // reached for a setter. That is #72's model, and the reason the old line
    // was not just broken but unnecessary.
    expect(screen.queryByTestId('execution-room')).toBeNull();
    expect(await screen.findByText(/No Implementation Manifests Yet/i)).toBeInTheDocument();
  });

  it('survives the click without throwing', async () => {
    // The original failure was a ReferenceError inside the handler, which
    // leaves the DOM untouched and the hash unchanged rather than blowing up
    // the tree. Assert on the console too, so a future regression that
    // swallows an error still fails here.
    const onError = vi.fn();
    window.addEventListener('error', onError);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const room = await openRoom();
    fireEvent.click(within(room).getByRole('button', { name: /Manifest Room/i }));
    await waitFor(() => expect(hash()).toBe('#/s/strat-1/manifest'));

    expect(onError).not.toHaveBeenCalled();
    window.removeEventListener('error', onError);
    spy.mockRestore();
  });
});

/* Same pattern, same reason. The breadcrumb's whole job is to navigate, so a
   suite that mounts it with vi.fn() and asserts it called the mock would prove
   the one thing that was never in doubt. These drive the real app. */
describe('the breadcrumb, wired to the real app', () => {
  it('goes to the strategy from segment 1 — the name that used to be an inert span', async () => {
    const room = await openRoom();
    const crumb = within(room).getByTestId('room-breadcrumb');

    fireEvent.click(within(crumb).getByRole('button', { name: /marketing and sales/i }));

    await waitFor(() => expect(hash()).toBe('#/s/strat-1/dashboard'));
    expect(screen.queryByTestId('execution-room')).toBeNull();
  });

  it('goes up to the step picker from segment 2', async () => {
    const room = await openRoom();
    const crumb = within(room).getByTestId('room-breadcrumb');

    fireEvent.click(within(crumb).getByRole('button', { name: /Execution Room/i }));

    await waitFor(() => expect(hash()).toBe('#/s/strat-1/execroom'));
    expect(screen.queryByTestId('execution-room')).toBeNull();
  });

  it('leaves segment 3 as where-you-are, not a link', async () => {
    const room = await openRoom();
    const crumb = within(room).getByTestId('room-breadcrumb');

    const here = within(crumb).getByText('OBJ-2608-A9C9');
    expect(here.closest('button')).toBeNull();
    expect(here.closest('[aria-current="page"]')).not.toBeNull();
    // Two links, not three — the last segment names the page you are on.
    expect(within(crumb).getAllByRole('button')).toHaveLength(2);
  });

  it('has no Back arrow left to mislabel its destination', async () => {
    const room = await openRoom();
    // The button whose tooltip said "Back to Staircase" while going to the
    // picker. Three named exits replaced it.
    expect(within(room).queryByRole('button', { name: /^Back$/i })).toBeNull();
    expect(within(room).queryByTitle(/Back to Staircase/i)).toBeNull();
  });

  it('prints the step code once, not twice', async () => {
    const room = await openRoom();
    // It used to appear in the breadcrumb's place AND inside the title line.
    expect(within(room).getAllByText('OBJ-2608-A9C9')).toHaveLength(1);
  });
});

describe('the breadcrumb in Arabic', () => {
  it('leaves the separator to the bidi algorithm instead of swapping it', async () => {
    const room = await openRoom({ lang: 'ar' });
    const crumb = within(room).getByTestId('room-breadcrumb');

    // U+203A is Bidi_Mirrored: the text engine renders it as ‹ inside an RTL
    // run on its own. Hand-swapping to ‹ here double-flips it and points the
    // crumbs back the way you came. Verified in Chromium — RTL › is
    // bitmap-identical to LTR ‹ — so this pins the codepoint against a
    // well-meant "fix" that would reintroduce the flip.
    expect(crumb.textContent).toContain('›');
    expect(crumb.textContent).not.toContain('‹');
  });

  it('uses the same separator codepoint in both directions', async () => {
    const ar = await openRoom({ lang: 'ar' });
    const arSep = within(ar).getByTestId('room-breadcrumb').textContent.match(/[‹›]/g);
    cleanup();
    localStorage.removeItem('stairs_lang');
    at('/');

    const en = await openRoom();
    const enSep = within(en).getByTestId('room-breadcrumb').textContent.match(/[‹›]/g);

    expect(arSep).toEqual(enSep);
    expect(enSep).toHaveLength(2);
  });

  it('isolates the element code so its digits and hyphens do not reorder', async () => {
    const room = await openRoom({ lang: 'ar' });
    const crumb = within(room).getByTestId('room-breadcrumb');

    // Without <bdi dir="ltr">, OBJ-2608-A9C9 renders scrambled inside the
    // RTL run — the hyphens are neutral and take the paragraph direction.
    const bdi = crumb.querySelector('bdi');
    expect(bdi).not.toBeNull();
    expect(bdi.getAttribute('dir')).toBe('ltr');
    expect(bdi.textContent).toBe('OBJ-2608-A9C9');
  });

  it('still navigates in RTL', async () => {
    const room = await openRoom({ lang: 'ar' });
    const crumb = within(room).getByTestId('room-breadcrumb');

    fireEvent.click(within(crumb).getByRole('button', { name: /الغرفة التنفيذية/ }));

    await waitFor(() => expect(hash()).toBe('#/s/strat-1/execroom'));
  });
});
