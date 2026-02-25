import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Markdown } from '../components/Markdown';
import { HealthBadge, ProgressRing, Modal } from '../components/SharedUI';
import { AlertsView } from '../components/AlertsView';
import { DashboardView } from '../components/DashboardView';
import { detectFrameworks, MATRIX_FRAMEWORKS, FrameworkButton, StrategyMatrixToolkit } from '../components/StrategyMatrixToolkit';

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


// ═══ STRATEGY MATRIX TOOLKIT TESTS ═══

describe('detectFrameworks', () => {
  it('returns empty array for null/empty text', () => {
    expect(detectFrameworks(null)).toEqual([]);
    expect(detectFrameworks("")).toEqual([]);
  });

  it('detects IFE Matrix', () => {
    expect(detectFrameworks("You should use the IFE Matrix to evaluate.")).toContain("ife");
  });

  it('detects EFE Matrix', () => {
    expect(detectFrameworks("The EFE Matrix shows external factors.")).toContain("efe");
  });

  it('detects SPACE Matrix', () => {
    expect(detectFrameworks("Apply the SPACE Matrix for positioning.")).toContain("space");
  });

  it('detects BCG Matrix', () => {
    expect(detectFrameworks("Use the BCG Matrix for portfolio analysis.")).toContain("bcg");
  });

  it('detects Porter Five Forces', () => {
    expect(detectFrameworks("Porter's Five Forces analysis is recommended.")).toContain("porter");
  });

  it('detects multiple frameworks in one text', () => {
    const text = "Compare the IFE Matrix and EFE Matrix results, then apply the BCG Matrix.";
    const found = detectFrameworks(text);
    expect(found).toContain("ife");
    expect(found).toContain("efe");
    expect(found).toContain("bcg");
  });

  it('returns no duplicates', () => {
    const text = "The IFE Matrix is important. Use the IFE Matrix again.";
    const found = detectFrameworks(text);
    expect(found.filter(k => k === "ife").length).toBe(1);
  });

  it('detects alternative phrasings', () => {
    expect(detectFrameworks("Internal Factor Evaluation is key.")).toContain("ife");
    expect(detectFrameworks("The Growth-Share Matrix helps classify.")).toContain("bcg");
    expect(detectFrameworks("Five Forces Analysis of the industry.")).toContain("porter");
  });
});


describe('MATRIX_FRAMEWORKS', () => {
  it('has all five frameworks defined', () => {
    expect(Object.keys(MATRIX_FRAMEWORKS)).toEqual(["ife", "efe", "space", "bcg", "porter"]);
  });

  it('each framework has name, icon, description', () => {
    for (const key of Object.keys(MATRIX_FRAMEWORKS)) {
      const fw = MATRIX_FRAMEWORKS[key];
      expect(fw.key).toBe(key);
      expect(fw.name).toBeTruthy();
      expect(fw.icon).toBeTruthy();
      expect(fw.description).toBeTruthy();
    }
  });
});


describe('FrameworkButton', () => {
  it('renders button with framework name', () => {
    const onClick = vi.fn();
    render(<FrameworkButton frameworkKey="ife" onClick={onClick} />);
    expect(screen.getByText(/IFE Matrix/)).toBeTruthy();
  });

  it('calls onClick with framework key when clicked', () => {
    const onClick = vi.fn();
    render(<FrameworkButton frameworkKey="bcg" onClick={onClick} />);
    fireEvent.click(screen.getByText(/BCG Matrix/));
    expect(onClick).toHaveBeenCalledWith("bcg");
  });

  it('returns null for unknown framework key', () => {
    const { container } = render(<FrameworkButton frameworkKey="unknown" onClick={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});


describe('StrategyMatrixToolkit', () => {
  it('renders nothing when not open', () => {
    const { container } = render(<StrategyMatrixToolkit open={false} matrixKey="ife" onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for null matrixKey', () => {
    const { container } = render(<StrategyMatrixToolkit open={true} matrixKey={null} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders IFE Matrix worksheet when open', () => {
    render(<StrategyMatrixToolkit open={true} matrixKey="ife" onClose={() => {}} />);
    expect(screen.getAllByText(/IFE Matrix/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Internal Factor Evaluation/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Strengths/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Weaknesses/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders EFE Matrix worksheet when open', () => {
    render(<StrategyMatrixToolkit open={true} matrixKey="efe" onClose={() => {}} />);
    expect(screen.getAllByText(/EFE Matrix/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Opportunities/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Threats/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders SPACE Matrix worksheet when open', () => {
    render(<StrategyMatrixToolkit open={true} matrixKey="space" onClose={() => {}} />);
    expect(screen.getAllByText(/SPACE Matrix/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Financial Strength/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Industry Strength/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders BCG Matrix worksheet when open', () => {
    render(<StrategyMatrixToolkit open={true} matrixKey="bcg" onClose={() => {}} />);
    expect(screen.getAllByText(/BCG Matrix/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Business Units/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders Porter Five Forces worksheet when open', () => {
    render(<StrategyMatrixToolkit open={true} matrixKey="porter" onClose={() => {}} />);
    expect(screen.getAllByText(/Porter's Five Forces/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Competitive Rivalry/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Threat of New Entrants/i).length).toBeGreaterThanOrEqual(1);
  });
});


describe('Markdown with framework detection', () => {
  it('renders framework buttons when onMatrixClick is provided', () => {
    const onClick = vi.fn();
    render(<Markdown text="Use the IFE Matrix for analysis." onMatrixClick={onClick} />);
    expect(screen.getByText(/IFE Matrix/)).toBeTruthy();
    expect(screen.getByText(/Interactive/)).toBeTruthy();
  });

  it('does not render framework buttons without onMatrixClick', () => {
    render(<Markdown text="Use the IFE Matrix for analysis." />);
    expect(screen.getByText(/Use the IFE Matrix for analysis./)).toBeTruthy();
    expect(screen.queryByText(/Interactive/)).toBeNull();
  });

  it('renders framework buttons in headings', () => {
    const onClick = vi.fn();
    render(<Markdown text="# Apply SPACE Matrix" onMatrixClick={onClick} />);
    expect(screen.getByText(/Interactive/)).toBeTruthy();
  });

  it('renders framework buttons in bullet points', () => {
    const onClick = vi.fn();
    render(<Markdown text="- Use the BCG Matrix to classify" onMatrixClick={onClick} />);
    expect(screen.getByText(/Interactive/)).toBeTruthy();
  });

  it('clicking framework button calls onMatrixClick', () => {
    const onClick = vi.fn();
    render(<Markdown text="Try Porter's Five Forces analysis." onMatrixClick={onClick} />);
    fireEvent.click(screen.getByText(/Porter's Five Forces/));
    expect(onClick).toHaveBeenCalledWith("porter");
  });
});
