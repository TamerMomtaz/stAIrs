import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeSlideshow, hasSeenWelcome, markWelcomeSeen } from '../components/WelcomeSlideshow';


beforeEach(() => {
  localStorage.clear();
});


describe('WelcomeSlideshow localStorage helpers', () => {
  it('hasSeenWelcome returns false for new user', () => {
    expect(hasSeenWelcome('user-1')).toBe(false);
  });

  it('markWelcomeSeen sets flag and hasSeenWelcome returns true', () => {
    markWelcomeSeen('user-1');
    expect(hasSeenWelcome('user-1')).toBe(true);
  });

  it('different users have independent flags', () => {
    markWelcomeSeen('user-1');
    expect(hasSeenWelcome('user-1')).toBe(true);
    expect(hasSeenWelcome('user-2')).toBe(false);
  });
});


describe('WelcomeSlideshow rendering', () => {
  it('renders nothing when not open', () => {
    const { container } = render(<WelcomeSlideshow open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders slideshow when open', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByTestId('welcome-slideshow')).toBeTruthy();
  });

  it('shows opening slide with ST.AIRS logo text', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByText('ST.AIRS')).toBeTruthy();
    expect(screen.getByText(/We begin there/)).toBeTruthy();
  });

  it('shows progress bar', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByTestId('slideshow-progress')).toBeTruthy();
  });

  it('shows prev/next buttons', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByTestId('slideshow-prev')).toBeTruthy();
    expect(screen.getByTestId('slideshow-next')).toBeTruthy();
  });

  it('shows 7 dot navigation buttons', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`slideshow-dot-${i}`)).toBeTruthy();
    }
  });

  it('shows close button', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByTestId('slideshow-close')).toBeTruthy();
  });
});


describe('WelcomeSlideshow navigation', () => {
  it('navigates to next slide on Next click', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-next'));
    expect(screen.getByText('Your Journey')).toBeTruthy();
  });

  it('navigates back on Prev click', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-next'));
    expect(screen.getByText('Your Journey')).toBeTruthy();
    fireEvent.click(screen.getByTestId('slideshow-prev'));
    expect(screen.getByText(/We begin there/)).toBeTruthy();
  });

  it('navigates via dot click', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-2'));
    expect(screen.getByText('Upload Your Documents')).toBeTruthy();
  });

  it('navigates with arrow keys', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Your Journey')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText(/We begin there/)).toBeTruthy();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<WelcomeSlideshow open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('slideshow-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(<WelcomeSlideshow open={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});


describe('WelcomeSlideshow slides content', () => {
  it('slide 1 (opening) shows tagline', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    expect(screen.getByText(/Most strategy tools stop at the recommendation/)).toBeTruthy();
  });

  it('slide 2 (journey) shows 4-step path', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-1'));
    expect(screen.getByText('Your Journey')).toBeTruthy();
    expect(screen.getByText(/Name your strategy/)).toBeTruthy();
    expect(screen.getByText(/Upload your documents/)).toBeTruthy();
    expect(screen.getByText(/AI pre-fills/)).toBeTruthy();
    expect(screen.getByText(/Review, adjust/)).toBeTruthy();
  });

  it('slide 3 (upload) shows file cards', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-2'));
    expect(screen.getByText('Upload Your Documents')).toBeTruthy();
    expect(screen.getByText('Pitch Deck.pdf')).toBeTruthy();
    expect(screen.getByText('Business Plan.docx')).toBeTruthy();
    expect(screen.getByText('Market Research.xlsx')).toBeTruthy();
  });

  it('slide 4 (frameworks) shows 5 matrix tools', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-3'));
    expect(screen.getByText('Strategic Frameworks')).toBeTruthy();
    expect(screen.getByText('IFE Matrix')).toBeTruthy();
    expect(screen.getByText('EFE Matrix')).toBeTruthy();
    expect(screen.getByText('SPACE Matrix')).toBeTruthy();
    expect(screen.getByText('BCG Matrix')).toBeTruthy();
    expect(screen.getByText("Porter's Five Forces")).toBeTruthy();
  });

  it('slide 5 (execution) shows action items and feedback loop', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-4'));
    expect(screen.getByText('Execution & Feedback')).toBeTruthy();
    expect(screen.getByText(/How far can I take this/)).toBeTruthy();
    expect(screen.getByText('Customized Plan')).toBeTruthy();
  });

  it('slide 6 (source of truth) shows data flow', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-5'));
    expect(screen.getByText('Source of Truth')).toBeTruthy();
    expect(screen.getByText('AI Extraction')).toBeTruthy();
    expect(screen.getByText('AI Advisor')).toBeTruthy();
  });

  it('slide 7 (closing) shows Get Started button', () => {
    render(<WelcomeSlideshow open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-6'));
    expect(screen.getByText(/Human IS the Loop/)).toBeTruthy();
    expect(screen.getByTestId('slideshow-get-started')).toBeTruthy();
    expect(screen.getByText(/Create Your First Strategy/)).toBeTruthy();
  });
});


describe('WelcomeSlideshow Get Started', () => {
  it('Get Started button on last slide calls onGetStarted and onClose', () => {
    const onClose = vi.fn();
    const onGetStarted = vi.fn();
    render(<WelcomeSlideshow open={true} onClose={onClose} onGetStarted={onGetStarted} />);
    fireEvent.click(screen.getByTestId('slideshow-dot-6'));
    fireEvent.click(screen.getByTestId('slideshow-get-started'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });

  it('Next button on last slide triggers Get Started action', () => {
    const onClose = vi.fn();
    const onGetStarted = vi.fn();
    render(<WelcomeSlideshow open={true} onClose={onClose} onGetStarted={onGetStarted} />);
    // Navigate to last slide
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByTestId('slideshow-next'));
    }
    // Click "Get Started" which replaces Next on last slide
    fireEvent.click(screen.getByTestId('slideshow-next'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onGetStarted).toHaveBeenCalledTimes(1);
  });
});
