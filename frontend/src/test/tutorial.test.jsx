import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TutorialOverlay, TutorialUpdatePrompt, FeaturesExploredBadge } from '../components/TutorialOverlay';
import {
  tutorialSteps,
  TUTORIAL_VERSION,
  TUTORIAL_STORAGE_KEY,
  getTutorialState,
  saveTutorialState,
  getDefaultTutorialState,
  shouldShowTutorial,
  hasNewTutorialSteps,
  getNewSteps,
  markFeatureUsed,
} from '../tutorialConfig';


beforeEach(() => {
  localStorage.clear();
});


describe('tutorialConfig', () => {
  it('exports tutorial steps array with required fields', () => {
    expect(Array.isArray(tutorialSteps)).toBe(true);
    expect(tutorialSteps.length).toBe(13);
    tutorialSteps.forEach(step => {
      expect(step).toHaveProperty('id');
      expect(step).toHaveProperty('title');
      expect(step).toHaveProperty('description');
      expect(step).toHaveProperty('icon');
      expect(typeof step.id).toBe('string');
      expect(typeof step.title).toBe('string');
      expect(typeof step.description).toBe('string');
    });
  });

  it('has unique step IDs', () => {
    const ids = tutorialSteps.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exports a version number', () => {
    expect(typeof TUTORIAL_VERSION).toBe('number');
    expect(TUTORIAL_VERSION).toBeGreaterThan(0);
  });

  it('shouldShowTutorial returns true for first-time user', () => {
    expect(shouldShowTutorial()).toBe(true);
  });

  it('shouldShowTutorial returns false after completing tutorial', () => {
    saveTutorialState({ completedVersion: TUTORIAL_VERSION, completedStepIds: [], featuresUsed: [], dismissed: false });
    expect(shouldShowTutorial()).toBe(false);
  });

  it('hasNewTutorialSteps detects version mismatch', () => {
    saveTutorialState({ completedVersion: TUTORIAL_VERSION - 1, completedStepIds: ['welcome'], featuresUsed: [], dismissed: false });
    // Only true when completedVersion > 0 and < current
    if (TUTORIAL_VERSION > 1) {
      expect(hasNewTutorialSteps()).toBe(true);
    }
  });

  it('getNewSteps filters out completed steps', () => {
    saveTutorialState({ completedVersion: 1, completedStepIds: ['welcome', 'dashboard'], featuresUsed: [], dismissed: false });
    const newSteps = getNewSteps();
    expect(newSteps.find(s => s.id === 'welcome')).toBeUndefined();
    expect(newSteps.find(s => s.id === 'dashboard')).toBeUndefined();
    expect(newSteps.length).toBe(tutorialSteps.length - 2);
  });

  it('getDefaultTutorialState returns valid defaults', () => {
    const state = getDefaultTutorialState();
    expect(state.completedVersion).toBe(0);
    expect(state.completedStepIds).toEqual([]);
    expect(state.featuresUsed).toEqual([]);
    expect(state.dismissed).toBe(false);
  });

  it('markFeatureUsed adds feature to state', () => {
    const state = markFeatureUsed('staircase');
    expect(state.featuresUsed).toContain('staircase');
  });

  it('markFeatureUsed does not duplicate features', () => {
    markFeatureUsed('staircase');
    const state = markFeatureUsed('staircase');
    expect(state.featuresUsed.filter(f => f === 'staircase').length).toBe(1);
  });

  it('getTutorialState reads from localStorage', () => {
    expect(getTutorialState()).toBe(null);
    const data = { completedVersion: 1, completedStepIds: [], featuresUsed: [], dismissed: false };
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(data));
    expect(getTutorialState()).toEqual(data);
  });
});


describe('TutorialOverlay', () => {
  it('renders nothing when not active', () => {
    const { container } = render(<TutorialOverlay active={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders overlay when active', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    expect(screen.getByTestId('tutorial-overlay')).toBeTruthy();
  });

  it('shows first step content', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    expect(screen.getByText('Welcome to ST.AIRS')).toBeTruthy();
    expect(screen.getByText(/strategic planning platform/)).toBeTruthy();
  });

  it('shows step counter', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    expect(screen.getByText(`Step 1 of ${tutorialSteps.length}`)).toBeTruthy();
  });

  it('advances on Next click', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText(tutorialSteps[1].title)).toBeTruthy();
    expect(screen.getByText(`Step 2 of ${tutorialSteps.length}`)).toBeTruthy();
  });

  it('goes back on Back click', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Next →'));
    fireEvent.click(screen.getByText('← Back'));
    expect(screen.getByText(tutorialSteps[0].title)).toBeTruthy();
  });

  it('calls onClose when Skip Tutorial is clicked', () => {
    const onClose = vi.fn();
    render(<TutorialOverlay active={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Skip Tutorial'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows completion screen after all steps', () => {
    render(<TutorialOverlay active={true} onClose={() => {}} />);
    // Click through steps 0..11 (Next → for each)
    for (let i = 0; i < tutorialSteps.length - 1; i++) {
      fireEvent.click(screen.getByText('Next →'));
    }
    // Now on the last step (index 12), button says "Finish"
    fireEvent.click(screen.getByText('Finish'));
    expect(screen.getByText("You're ready to climb!")).toBeTruthy();
  });

  it('saves tutorial state on completion', () => {
    const onClose = vi.fn();
    render(<TutorialOverlay active={true} onClose={onClose} />);
    // Click through steps 0..11
    for (let i = 0; i < tutorialSteps.length - 1; i++) {
      fireEvent.click(screen.getByText('Next →'));
    }
    // Now on the last step, click "Finish"
    fireEvent.click(screen.getByText('Finish'));
    // Now on completion screen, click "Let's Go"
    fireEvent.click(screen.getByText("Let's Go"));
    const state = getTutorialState();
    expect(state.completedVersion).toBe(TUTORIAL_VERSION);
    expect(state.completedStepIds.length).toBe(tutorialSteps.length);
    expect(onClose).toHaveBeenCalled();
  });

  it('accepts custom steps', () => {
    const customSteps = [
      { id: 'test1', title: 'Custom Step One', description: 'First custom', selector: null, icon: '🧪', featureKey: null },
      { id: 'test2', title: 'Custom Step Two', description: 'Second custom', selector: null, icon: '🔬', featureKey: null },
    ];
    render(<TutorialOverlay active={true} onClose={() => {}} steps={customSteps} />);
    expect(screen.getByText('Custom Step One')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  });

  it('has dot indicators matching step count', () => {
    const { container } = render(<TutorialOverlay active={true} onClose={() => {}} />);
    const dots = container.querySelectorAll('.rounded-full.transition-all.duration-300');
    expect(dots.length).toBe(tutorialSteps.length);
  });
});


describe('TutorialUpdatePrompt', () => {
  it('renders with action buttons', () => {
    render(<TutorialUpdatePrompt onStart={() => {}} onDismiss={() => {}} />);
    expect(screen.getByTestId('tutorial-update-prompt')).toBeTruthy();
    expect(screen.getByText('New features added!')).toBeTruthy();
    expect(screen.getByText('Show me')).toBeTruthy();
    expect(screen.getByText('Maybe later')).toBeTruthy();
  });

  it('calls onStart when Show me is clicked', () => {
    const onStart = vi.fn();
    render(<TutorialUpdatePrompt onStart={onStart} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText('Show me'));
    expect(onStart).toHaveBeenCalled();
  });

  it('calls onDismiss when Maybe later is clicked', () => {
    const onDismiss = vi.fn();
    render(<TutorialUpdatePrompt onStart={() => {}} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText('Maybe later'));
    expect(onDismiss).toHaveBeenCalled();
  });
});


describe('FeaturesExploredBadge', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<FeaturesExploredBadge show={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when no tutorial state exists', () => {
    const { container } = render(<FeaturesExploredBadge show={true} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders badge with progress when state exists', () => {
    saveTutorialState({ completedVersion: 1, completedStepIds: [], featuresUsed: ['staircase', 'ai_chat'], dismissed: false });
    render(<FeaturesExploredBadge show={true} onClose={() => {}} />);
    expect(screen.getByTestId('features-badge')).toBeTruthy();
    expect(screen.getByText('Features Explored')).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    saveTutorialState({ completedVersion: 1, completedStepIds: [], featuresUsed: [], dismissed: false });
    const onClose = vi.fn();
    render(<FeaturesExploredBadge show={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('✕'));
    expect(onClose).toHaveBeenCalled();
  });
});
