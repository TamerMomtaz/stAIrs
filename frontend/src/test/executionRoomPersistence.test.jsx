/**
 * Execution Room persistence + AI-call discipline.
 *
 * The bug this covers: generated content was held in React state (mirrored into
 * a write-only localStorage store), so every remount showed nothing and the app
 * re-asked the AI for work it had already paid for. These tests pin the new
 * contract:
 *
 *   - mounting reads persisted content back and calls the AI zero times
 *   - navigating away and back re-reads, still zero AI calls
 *   - an empty room offers a Generate button instead of generating unasked
 *   - double-clicking Generate produces one call
 *   - a failed save is shown to the client, not swallowed
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { StrictMode } from 'react';

const aiPost = vi.fn();
const artifactSave = vi.fn();
const plansForStair = vi.fn();
const artifactsForStair = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    api: { aiPost: (...a) => aiPost(...a), get: vi.fn(), post: vi.fn(), put: vi.fn() },
    ActionPlansAPI: {
      getForStair: (...a) => plansForStair(...a),
      save: vi.fn(() => Promise.resolve({ id: 'plan-1', created_at: '2026-08-08T10:00:00Z' })),
      updateTaskDone: vi.fn(() => Promise.resolve({})),
    },
    ArtifactsAPI: {
      ...actual.ArtifactsAPI,
      forStair: (...a) => artifactsForStair(...a),
      save: (...a) => artifactSave(...a),
    },
    SourcesAPI: { ...actual.SourcesAPI, create: vi.fn(() => Promise.resolve({})) },
  };
});

const { ExecutionRoom } = await import('../components/ExecutionRoom');

const STAIR = {
  id: 'stair-1', title: 'Onboard 15 Pilot Companies', code: 'KR-001',
  element_type: 'key_result', health: 'at_risk', progress_percent: 33,
  description: 'Sign and onboard 15 companies',
};
const STRATEGY = { id: 'strat-1', name: 'Growth 2026', company: 'Acme', industry: 'SaaS' };

const savedPlan = {
  id: 'plan-1', plan_type: 'recommended', created_at: '2026-08-08T10:00:00Z',
  raw_text: '## Action Plan\n\n- **Task:** Build the pipeline\n- **Owner:** BD\n- **Timeline:** 4 weeks\n- **Priority:** High\n- **Details:** Contact 30 leads',
  tasks: [{ id: 't1', name: 'Build the pipeline', owner: 'BD', timeline: '4 weeks', priority: 'High', details: 'Contact 30 leads', done: false }],
};
const savedSolutions = {
  id: 'a1', artifact_type: 'solutions', scope_key: 'stair-1',
  content: '## Solutions & Recommendations\n\nQuick wins first.',
  payload: {}, generated_at: '2026-08-08T11:30:00Z',
};

const renderRoom = (opts = {}) => render(
  <ExecutionRoom stair={STAIR} strategyContext={STRATEGY} lang="en" onNavigate={() => {}} {...opts} />
);

beforeEach(() => {
  aiPost.mockReset();
  artifactSave.mockReset().mockResolvedValue({ generated_at: '2026-08-08T12:00:00Z' });
  plansForStair.mockReset().mockResolvedValue([savedPlan]);
  artifactsForStair.mockReset().mockResolvedValue([savedSolutions]);
  localStorage.clear();
});
afterEach(cleanup);

describe('ExecutionRoom — reads persisted content back', () => {
  it('shows the saved action plan without calling the AI', async () => {
    renderRoom();
    expect(await screen.findByText('Build the pipeline')).toBeTruthy();
    expect(aiPost).not.toHaveBeenCalled();
  });

  it('shows saved recommendations without calling the AI', async () => {
    renderRoom();
    await screen.findByText('Build the pipeline');
    fireEvent.click(screen.getByText(/Recommendations/i));
    expect(await screen.findByText(/Quick wins first/)).toBeTruthy();
    expect(aiPost).not.toHaveBeenCalled();
  });

  it('says when content was generated, so it reads as saved', async () => {
    renderRoom();
    await screen.findByText('Build the pipeline');
    const stamps = await screen.findAllByText(/Saved/);
    expect(stamps.length).toBeGreaterThan(0);
  });

  it('navigating away and back re-reads with zero AI calls', async () => {
    const { unmount } = renderRoom();
    await screen.findByText('Build the pipeline');
    unmount();
    renderRoom();
    await screen.findByText('Build the pipeline');
    expect(aiPost).not.toHaveBeenCalled();
    expect(plansForStair).toHaveBeenCalledTimes(2);
  });

  it('survives React StrictMode double-invoking the mount effect', async () => {
    render(
      <StrictMode>
        <ExecutionRoom stair={STAIR} strategyContext={STRATEGY} lang="en" onNavigate={() => {}} />
      </StrictMode>
    );
    await screen.findByText('Build the pipeline');
    expect(aiPost).not.toHaveBeenCalled();
  });
});

describe('ExecutionRoom — never generates unasked', () => {
  it('offers a Generate button instead of generating when no plan exists', async () => {
    plansForStair.mockResolvedValue([]);
    artifactsForStair.mockResolvedValue([]);
    renderRoom();
    expect(await screen.findByText(/Generate action plan/i)).toBeTruthy();
    expect(aiPost).not.toHaveBeenCalled();
  });

  it('offers a Generate button instead of generating when no recommendations exist', async () => {
    artifactsForStair.mockResolvedValue([]);
    renderRoom();
    await screen.findByText('Build the pipeline');
    fireEvent.click(screen.getByText(/Recommendations/i));
    expect(await screen.findByText(/Generate recommendations/i)).toBeTruthy();
    expect(aiPost).not.toHaveBeenCalled();
  });

  it('does not regenerate when the read fails — it says so instead', async () => {
    plansForStair.mockRejectedValue(new Error('network down'));
    artifactsForStair.mockRejectedValue(new Error('network down'));
    renderRoom();
    expect(await screen.findByText(/Couldn't load your saved content/i)).toBeTruthy();
    expect(aiPost).not.toHaveBeenCalled();
  });

  it('selecting an action does not commission an explanation', async () => {
    renderRoom();
    fireEvent.click(await screen.findByText('Build the pipeline'));
    await screen.findByText(/Explain this action/i);
    expect(aiPost).not.toHaveBeenCalled();
  });
});

describe('ExecutionRoom — one click, one call', () => {
  it('double-clicking Generate fires exactly one AI call', async () => {
    plansForStair.mockResolvedValue([]);
    artifactsForStair.mockResolvedValue([]);
    let resolveAi;
    aiPost.mockReturnValue(new Promise(res => { resolveAi = res; }));

    renderRoom();
    const btn = await screen.findByText(/Generate action plan/i);
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(aiPost).toHaveBeenCalledTimes(1);
    resolveAi({ response: '## Action Plan\n\n- **Task:** Do it\n- **Owner:** X\n- **Timeline:** 1w\n- **Priority:** High\n- **Details:** y' });
    await waitFor(() => expect(screen.getByText('Do it')).toBeTruthy());
  });

  it('passes a trigger label naming what caused the call', async () => {
    artifactsForStair.mockResolvedValue([]);
    aiPost.mockResolvedValue({ response: '## Solutions\n\nok' });
    renderRoom();
    await screen.findByText('Build the pipeline');
    fireEvent.click(screen.getByText(/Recommendations/i));
    fireEvent.click(await screen.findByText(/Generate recommendations/i));
    await waitFor(() => expect(aiPost).toHaveBeenCalled());
    expect(aiPost.mock.calls[0][3]).toBe('execroom:generate-solutions');
  });
});

describe('ExecutionRoom — generated content is written to the server', () => {
  it('persists recommendations after generating them', async () => {
    artifactsForStair.mockResolvedValue([]);
    aiPost.mockResolvedValue({ response: '## Solutions\n\nBrand new advice' });
    renderRoom();
    await screen.findByText('Build the pipeline');
    fireEvent.click(screen.getByText(/Recommendations/i));
    fireEvent.click(await screen.findByText(/Generate recommendations/i));
    await waitFor(() => expect(artifactSave).toHaveBeenCalled());
    const call = artifactSave.mock.calls[0][0];
    expect(call.artifactType).toBe('solutions');
    expect(call.scopeKey).toBe('stair-1');
    expect(call.stairId).toBe('stair-1');
    expect(call.content).toContain('Brand new advice');
  });

  it('tells the client when a save fails instead of losing it quietly', async () => {
    artifactsForStair.mockResolvedValue([]);
    artifactSave.mockRejectedValue(new Error('offline'));
    aiPost.mockResolvedValue({ response: '## Solutions\n\nAdvice that could not be saved' });
    renderRoom();
    await screen.findByText('Build the pipeline');
    fireEvent.click(screen.getByText(/Recommendations/i));
    fireEvent.click(await screen.findByText(/Generate recommendations/i));

    expect(await screen.findByText(/Couldn't save/i)).toBeTruthy();
    // …and the content is still on screen, so nothing is silently lost.
    expect(screen.getByText(/Advice that could not be saved/)).toBeTruthy();
  });
});
