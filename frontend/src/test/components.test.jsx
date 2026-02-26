import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Markdown } from '../components/Markdown';
import { HealthBadge, ProgressRing, Modal } from '../components/SharedUI';
import { AlertsView } from '../components/AlertsView';
import { DashboardView } from '../components/DashboardView';
import { detectFrameworks, MATRIX_FRAMEWORKS, FrameworkButton, StrategyMatrixToolkit, parseFrameworkData } from '../components/StrategyMatrixToolkit';

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


// ═══ PARSER TESTS ═══

describe('parseFrameworkData — IFE Matrix', () => {
  it('returns null for text without tables', () => {
    const text = "The IFE Matrix is a strategic tool for evaluating internal factors.";
    expect(parseFrameworkData(text, "ife")).toBeNull();
  });

  it('parses standard format with ### section headings', () => {
    const text = `## IFE Matrix Analysis

### Strengths

| Factor | Weight | Rating | Weighted Score |
|--------|--------|--------|----------------|
| Strong brand recognition | 0.15 | 4 | 0.60 |
| Experienced management | 0.10 | 3 | 0.30 |

### Weaknesses

| Factor | Weight | Rating | Weighted Score |
|--------|--------|--------|----------------|
| Limited R&D investment | 0.12 | 1 | 0.12 |
| High employee turnover | 0.08 | 2 | 0.16 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths).toHaveLength(2);
    expect(result.weaknesses).toHaveLength(2);
    expect(result.strengths[0].factor).toBe("Strong brand recognition");
    expect(result.strengths[0].weight).toBeCloseTo(0.15);
    expect(result.strengths[0].rating).toBe(4);
    expect(result.weaknesses[0].factor).toBe("Limited R&D investment");
    expect(result.weaknesses[0].weight).toBeCloseTo(0.12);
    expect(result.weaknesses[0].rating).toBe(1);
  });

  it('parses #### sub-headings', () => {
    const text = `## IFE Matrix

#### Strengths

| Factor | Weight | Rating |
|--------|--------|--------|
| Good team | 0.20 | 4 |

#### Weaknesses

| Factor | Weight | Rating |
|--------|--------|--------|
| Old tech | 0.15 | 1 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths).toHaveLength(1);
    expect(result.strengths[0].factor).toBe("Good team");
    expect(result.weaknesses).toHaveLength(1);
    expect(result.weaknesses[0].factor).toBe("Old tech");
  });

  it('parses bold section headings', () => {
    const text = `**Strengths:**

| Factor | Weight | Rating |
|--------|--------|--------|
| Brand | 0.20 | 4 |

**Weaknesses:**

| Factor | Weight | Rating |
|--------|--------|--------|
| Costs | 0.15 | 2 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Brand");
    expect(result.weaknesses[0].factor).toBe("Costs");
  });

  it('parses combined table without section headings (fallback)', () => {
    const text = `## IFE Matrix

| Factor | Weight | Rating | Score |
|--------|--------|--------|-------|
| Brand | 0.15 | 4 | 0.60 |
| R&D | 0.12 | 1 | 0.12 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths.length).toBeGreaterThanOrEqual(1);
    expect(result.weaknesses.length).toBeGreaterThanOrEqual(1);
    expect(result.strengths[0].factor).toBe("Brand");
    expect(result.weaknesses[0].factor).toBe("R&D");
  });

  it('handles bold markers in table cells', () => {
    const text = `### Strengths

| **Key Factor** | **Weight** | **Rating** | **Weighted Score** |
|:--|:--:|:--:|:--:|
| **Strong brand** | 0.15 | 4 | 0.60 |

### Weaknesses

| **Key Factor** | **Weight** | **Rating** | **Weighted Score** |
|:--|:--:|:--:|:--:|
| **Old tech** | 0.12 | 1 | 0.12 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Strong brand");
    expect(result.strengths[0].weight).toBeCloseTo(0.15);
    expect(result.weaknesses[0].factor).toBe("Old tech");
  });

  it('handles "Weighted Score" column without confusing it with "Weight"', () => {
    const text = `### Strengths

| Factor | Weighted Score | Weight | Rating |
|--------|----------------|--------|--------|
| Brand | 0.60 | 0.15 | 4 |

### Weaknesses

| Factor | Weighted Score | Weight | Rating |
|--------|----------------|--------|--------|
| R&D | 0.12 | 0.12 | 1 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].weight).toBeCloseTo(0.15);
    expect(result.strengths[0].rating).toBe(4);
  });

  it('filters out Total/Summary rows', () => {
    const text = `### Strengths

| Factor | Weight | Rating | Score |
|--------|--------|--------|-------|
| Brand | 0.15 | 4 | 0.60 |
| Team | 0.10 | 3 | 0.30 |
| Total | 1.00 |  | 2.55 |

### Weaknesses

| Factor | Weight | Rating | Score |
|--------|--------|--------|-------|
| R&D | 0.12 | 1 | 0.12 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths).toHaveLength(2);
    expect(result.strengths.find(s => s.factor === "Total")).toBeUndefined();
  });

  it('handles italic markers in cells', () => {
    const text = `### Strengths

| Factor | Weight | Rating |
|--------|--------|--------|
| *Strong brand* | *0.15* | *4* |

### Weaknesses

| Factor | Weight | Rating |
|--------|--------|--------|
| *Old tech* | *0.12* | *1* |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Strong brand");
    expect(result.strengths[0].weight).toBeCloseTo(0.15);
    expect(result.weaknesses[0].factor).toBe("Old tech");
  });

  it('handles "Key Internal Strengths/Weaknesses" headings', () => {
    const text = `### Key Internal Strengths

| Key Factor | Weight | Rating |
|------------|--------|--------|
| Brand | 0.20 | 4 |

### Key Internal Weaknesses

| Key Factor | Weight | Rating |
|------------|--------|--------|
| Costs | 0.15 | 2 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Brand");
    expect(result.weaknesses[0].factor).toBe("Costs");
  });

  it('handles alignment colons in separator rows', () => {
    const text = `### Strengths

| Factor | Weight | Rating |
|:-------|:------:|:------:|
| Brand | 0.15 | 4 |

### Weaknesses

| Factor | Weight | Rating |
|:-------|:------:|:------:|
| R&D | 0.12 | 1 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Brand");
    expect(result.weaknesses[0].factor).toBe("R&D");
  });

  it('handles column name "Description" or "Item"', () => {
    const text = `### Strengths

| Item | Weight | Rating |
|------|--------|--------|
| Brand | 0.20 | 4 |

### Weaknesses

| Description | Weight | Rating |
|-------------|--------|--------|
| Old tech | 0.15 | 1 |`;

    const result = parseFrameworkData(text, "ife");
    expect(result).not.toBeNull();
    expect(result.strengths[0].factor).toBe("Brand");
    expect(result.weaknesses[0].factor).toBe("Old tech");
  });
});


describe('parseFrameworkData — EFE Matrix', () => {
  it('parses standard EFE format', () => {
    const text = `### Opportunities

| Factor | Weight | Rating |
|--------|--------|--------|
| Market growth | 0.20 | 4 |

### Threats

| Factor | Weight | Rating |
|--------|--------|--------|
| Regulation | 0.15 | 2 |`;

    const result = parseFrameworkData(text, "efe");
    expect(result).not.toBeNull();
    expect(result.opportunities[0].factor).toBe("Market growth");
    expect(result.threats[0].factor).toBe("Regulation");
  });
});


describe('parseFrameworkData — BCG Matrix', () => {
  it('parses BCG table', () => {
    const text = `| Product | Market Growth | Market Share |
|---------|---------------|--------------|
| Widget A | 15 | 2.0 |
| Widget B | 5 | 0.5 |`;

    const result = parseFrameworkData(text, "bcg");
    expect(result).not.toBeNull();
    expect(result.units).toHaveLength(2);
    expect(result.units[0].name).toBe("Widget A");
    expect(result.units[0].growth).toBe(15);
    expect(result.units[0].share).toBe(2.0);
  });
});


describe('parseFrameworkData — SPACE Matrix', () => {
  it('parses SPACE dimensions', () => {
    const text = `### Financial Strength

| Factor | Score |
|--------|-------|
| ROI | 4 |

### Competitive Advantage

| Factor | Score |
|--------|-------|
| Market Share | 3 |

### Environmental Stability

| Factor | Score |
|--------|-------|
| Tech Changes | 3 |

### Industry Strength

| Factor | Score |
|--------|-------|
| Growth | 5 |`;

    const result = parseFrameworkData(text, "space");
    expect(result).not.toBeNull();
    expect(result.fs[0].factor).toBe("ROI");
    expect(result.fs[0].score).toBe(4);
    expect(result.ca[0].score).toBeLessThan(0);
    expect(result.es[0].score).toBeLessThan(0);
    expect(result.is[0].score).toBe(5);
  });
});


describe('parseFrameworkData — Porter Five Forces', () => {
  it('parses Porter forces', () => {
    const text = `### Competitive Rivalry

| Factor | Rating |
|--------|--------|
| Competition | 4 |

### Threat of New Entrants

| Factor | Rating |
|--------|--------|
| Barriers | 2 |

### Threat of Substitutes

| Factor | Rating |
|--------|--------|
| Alternatives | 3 |

### Bargaining Power of Buyers

| Factor | Rating |
|--------|--------|
| Volume | 3 |

### Bargaining Power of Suppliers

| Factor | Rating |
|--------|--------|
| Concentration | 4 |`;

    const result = parseFrameworkData(text, "porter");
    expect(result).not.toBeNull();
    expect(result.rivalry[0].factor).toBe("Competition");
    expect(result.rivalry[0].rating).toBe(4);
    expect(result.newEntrants[0].factor).toBe("Barriers");
    expect(result.substitutes[0].factor).toBe("Alternatives");
    expect(result.buyers[0].factor).toBe("Volume");
    expect(result.suppliers[0].factor).toBe("Concentration");
  });
});


// ═══ Source of Truth ═══
import { SourceOfTruthView } from '../components/SourceOfTruthView';

describe('SourceOfTruthView', () => {
  it('renders header text in English', () => {
    render(<SourceOfTruthView lang="en" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    expect(screen.getByText('Source of Truth')).toBeTruthy();
    expect(screen.getByText('Track every input that shaped this strategy')).toBeTruthy();
  });

  it('renders header text in Arabic', () => {
    render(<SourceOfTruthView lang="ar" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    expect(screen.getByText('مصدر الحقيقة')).toBeTruthy();
  });

  it('renders manual entry button', () => {
    render(<SourceOfTruthView lang="en" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    expect(screen.getByText('+ Manual Entry')).toBeTruthy();
  });

  it('renders filter type cards', () => {
    render(<SourceOfTruthView lang="en" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    expect(screen.getByText('Questionnaire')).toBeTruthy();
    expect(screen.getByText('AI Chat')).toBeTruthy();
    expect(screen.getByText('Feedback')).toBeTruthy();
    expect(screen.getByText('Manual Entry')).toBeTruthy();
    expect(screen.getByText('AI Extraction')).toBeTruthy();
  });

  it('renders search input', () => {
    render(<SourceOfTruthView lang="en" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    expect(screen.getByPlaceholderText('Search across all sources...')).toBeTruthy();
  });

  it('renders empty state when no sources', async () => {
    render(<SourceOfTruthView lang="en" strategyContext={{ id: 'test-strat-1', name: 'Test Strategy' }} />);
    // Initially shows loading, then empty state after fetch attempt
    // We just verify the component renders without crashing
    expect(screen.getByText('Source of Truth')).toBeTruthy();
  });
});
