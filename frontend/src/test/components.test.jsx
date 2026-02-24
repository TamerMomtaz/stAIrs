import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from '../components/Markdown';
import { HealthBadge, ProgressRing, Modal } from '../components/SharedUI';
import { AlertsView } from '../components/AlertsView';
import { DashboardView } from '../components/DashboardView';

describe('Markdown', () => {
  it('renders null for empty text', () => {
    const { container } = render(<Markdown text="" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders null for null text', () => {
    const { container } = render(<Markdown text={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders h2 for # heading', () => {
    render(<Markdown text="# Hello World" />);
    expect(screen.getByText('Hello World')).toBeTruthy();
  });

  it('renders h3 for ## heading', () => {
    render(<Markdown text="## Sub heading" />);
    expect(screen.getByText('Sub heading')).toBeTruthy();
  });

  it('renders bullet points', () => {
    render(<Markdown text="- Item one" />);
    expect(screen.getByText('Item one')).toBeTruthy();
  });

  it('renders paragraphs', () => {
    render(<Markdown text="Normal text here" />);
    expect(screen.getByText('Normal text here')).toBeTruthy();
  });
});


describe('HealthBadge', () => {
  it('renders on_track badge', () => {
    render(<HealthBadge health="on_track" />);
    expect(screen.getByText(/ON TRACK/)).toBeTruthy();
  });

  it('renders at_risk badge', () => {
    render(<HealthBadge health="at_risk" />);
    expect(screen.getByText(/AT RISK/)).toBeTruthy();
  });

  it('renders off_track badge', () => {
    render(<HealthBadge health="off_track" />);
    expect(screen.getByText(/OFF TRACK/)).toBeTruthy();
  });

  it('renders achieved badge', () => {
    render(<HealthBadge health="achieved" />);
    expect(screen.getByText(/ACHIEVED/)).toBeTruthy();
  });
});


describe('ProgressRing', () => {
  it('renders with default props', () => {
    const { container } = render(<ProgressRing />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('text').textContent).toBe('0%');
  });

  it('renders with specified percent', () => {
    const { container } = render(<ProgressRing percent={75} />);
    expect(container.querySelector('text').textContent).toBe('75%');
  });
});


describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(container.innerHTML).toBe('');
  });

  it('renders content when open', () => {
    render(<Modal open={true} onClose={() => {}} title="My Modal">Modal Body</Modal>);
    expect(screen.getByText('My Modal')).toBeTruthy();
    expect(screen.getByText('Modal Body')).toBeTruthy();
  });
});


describe('AlertsView', () => {
  it('shows empty state when no alerts', () => {
    render(<AlertsView alerts={[]} lang="en" />);
    expect(screen.getByText('No active alerts')).toBeTruthy();
  });

  it('shows empty state in Arabic', () => {
    render(<AlertsView alerts={[]} lang="ar" />);
    expect(screen.getByText('لا توجد تنبيهات')).toBeTruthy();
  });

  it('renders alerts', () => {
    const alerts = [
      { severity: 'critical', title: 'Critical Alert', description: 'Something broke' },
      { severity: 'info', title: 'Info Alert', description: 'FYI' },
    ];
    render(<AlertsView alerts={alerts} lang="en" />);
    expect(screen.getByText('Critical Alert')).toBeTruthy();
    expect(screen.getByText('Info Alert')).toBeTruthy();
  });
});


describe('DashboardView', () => {
  it('renders with empty data', () => {
    render(<DashboardView data={null} lang="en" />);
    // 0% appears in both ProgressRing SVG and the stats div
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
  });

  it('renders stats', () => {
    const data = {
      stats: { total_elements: 10, on_track: 6, at_risk: 2, off_track: 2, overall_progress: 65 },
      top_risks: [],
    };
    render(<DashboardView data={data} lang="en" />);
    expect(screen.getByText('10')).toBeTruthy();
    // 65% appears in both ProgressRing SVG and the stats div
    expect(screen.getAllByText('65%').length).toBeGreaterThanOrEqual(1);
  });
});
