/**
 * "Where did my work go?" — the client should be able to see that generated
 * content was saved and find it again without hunting.
 *
 *   - the staircase row says how many of a stair's actions have saved work
 *   - the Execution Room points at the Manifest Room, where that work lives
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const artifactsForStrategy = vi.fn();
const plansForStrategy = vi.fn();
const plansForStair = vi.fn();
const artifactsForStair = vi.fn();

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    api: { aiPost: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() },
    ActionPlansAPI: {
      getForStrategy: (...a) => plansForStrategy(...a),
      getForStair: (...a) => plansForStair(...a),
      save: vi.fn(), updateTaskDone: vi.fn(),
    },
    ArtifactsAPI: {
      ...actual.ArtifactsAPI,
      forStrategy: (...a) => artifactsForStrategy(...a),
      forStair: (...a) => artifactsForStair(...a),
      save: vi.fn(() => Promise.resolve({ generated_at: '2026-08-08T12:00:00Z' })),
    },
    SourcesAPI: { ...actual.SourcesAPI, create: vi.fn() },
  };
});

const { StaircaseView } = await import('../components/StaircaseView');
const { ExecutionRoom } = await import('../components/ExecutionRoom');

const STRATEGY = { id: 'strat-1', name: 'Growth 2026', company: 'Acme' };
const STAIR = {
  id: 'stair-1', title: 'Onboard 15 Pilot Companies', code: 'KR-001',
  element_type: 'key_result', health: 'at_risk', progress_percent: 33,
};
const TREE = [{ stair: STAIR, children: [] }];

// Eight actions on the plan; three of them have work saved against them.
const planGroups = [{
  stair_id: 'stair-1',
  plans: [{
    id: 'plan-1', plan_type: 'recommended',
    tasks: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `Task ${i}`, done: false })),
  }],
}];
const artifacts = [
  { artifact_type: 'explain', scope_key: 'stair-1:t0', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
  { artifact_type: 'impl_guide', scope_key: 'stair-1:t1', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
  { artifact_type: 'assess_chat', scope_key: 'stair-1:t2', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
  // Stair-level artifact — must not be counted as an action.
  { artifact_type: 'solutions', scope_key: 'stair-1', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
];

beforeEach(() => {
  artifactsForStrategy.mockReset().mockResolvedValue(artifacts);
  plansForStrategy.mockReset().mockResolvedValue(planGroups);
  plansForStair.mockReset().mockResolvedValue([]);
  artifactsForStair.mockReset().mockResolvedValue([]);
});
afterEach(cleanup);

describe('staircase row — saved work is visible', () => {
  const renderTree = (props = {}) => render(
    <StaircaseView tree={TREE} lang="en" strategyContext={STRATEGY}
      onEdit={() => {}} onAdd={() => {}} onExport={() => {}} onMove={() => {}} {...props} />
  );

  it('says how many actions have saved work', async () => {
    renderTree();
    expect(await screen.findByText(/3 of 8 actions have saved work/i)).toBeTruthy();
  });

  it('takes you to the work when clicked', async () => {
    const onExecutionRoom = vi.fn();
    renderTree({ onExecutionRoom });
    fireEvent.click(await screen.findByText(/3 of 8 actions have saved work/i));
    expect(onExecutionRoom).toHaveBeenCalledWith(STAIR);
  });

  it('stays quiet when nothing has been generated yet', async () => {
    artifactsForStrategy.mockResolvedValue([]);
    renderTree();
    await screen.findByText('Onboard 15 Pilot Companies');
    expect(screen.queryByText(/saved work/i)).toBeNull();
  });

  it('ignores work orphaned by a regenerated plan', async () => {
    // Artifacts point at task ids the current plan no longer has.
    artifactsForStrategy.mockResolvedValue([
      { artifact_type: 'explain', scope_key: 'stair-1:stale-1', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
      { artifact_type: 'explain', scope_key: 'stair-1:t0', content: 'x', payload: {}, generated_at: '2026-08-08T10:00:00Z' },
    ]);
    renderTree();
    expect(await screen.findByText(/1 of 8 actions has saved work/i)).toBeTruthy();
  });
});

describe('Execution Room — signposts the Manifest Room', () => {
  const savedArtifacts = [
    { artifact_type: 'solutions', scope_key: 'stair-1', content: '## Solutions\n\nQuick wins.', payload: {}, generated_at: '2026-08-08T11:00:00Z' },
  ];

  it('offers a way to the Manifest Room once there is saved work', async () => {
    artifactsForStair.mockResolvedValue(savedArtifacts);
    const onOpenManifest = vi.fn();
    render(<ExecutionRoom stair={STAIR} strategyContext={STRATEGY} lang="en" onBack={() => {}} onOpenManifest={onOpenManifest} />);
    fireEvent.click(await screen.findByText(/Manifest Room/i));
    expect(onOpenManifest).toHaveBeenCalled();
  });

  it('counts the saved items so the client knows there is something to find', async () => {
    artifactsForStair.mockResolvedValue(savedArtifacts);
    render(<ExecutionRoom stair={STAIR} strategyContext={STRATEGY} lang="en" onBack={() => {}} onOpenManifest={() => {}} />);
    expect(await screen.findByText(/1 saved item/i)).toBeTruthy();
  });

  it('does not signpost an empty Manifest Room', async () => {
    artifactsForStair.mockResolvedValue([]);
    render(<ExecutionRoom stair={STAIR} strategyContext={STRATEGY} lang="en" onBack={() => {}} onOpenManifest={() => {}} />);
    await screen.findByText(/No action plan yet/i);
    expect(screen.queryByText(/Manifest Room/i)).toBeNull();
  });
});
