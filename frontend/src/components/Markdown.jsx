import { FRAMEWORK_PATTERNS, MATRIX_FRAMEWORKS, FrameworkButton } from "./StrategyMatrixToolkit";

// ═══ INLINE FRAMEWORK DETECTION ═══
const renderInlineWithFrameworks = (text, className, onMatrixClick) => {
  if (!onMatrixClick || !text) return <span className={className}>{text}</span>;

  // Build a combined regex from all framework patterns
  const allPatterns = FRAMEWORK_PATTERNS.map(p => `(${p.regex.source})`).join("|");
  const combinedRegex = new RegExp(allPatterns, "gi");

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    // Find which framework key matched
    const matchedText = match[0];
    let frameworkKey = null;
    for (const { regex, key } of FRAMEWORK_PATTERNS) {
      regex.lastIndex = 0;
      if (regex.test(matchedText)) { frameworkKey = key; break; }
    }
    parts.push({ type: "framework", value: matchedText, key: frameworkKey });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (parts.length === 0) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === "framework" && p.key
          ? <FrameworkButton key={i} frameworkKey={p.key} onClick={onMatrixClick} />
          : <span key={i}>{p.value}</span>
      )}
    </span>
  );
};

// Process bold markers (**text**) and framework detection on a text string
const processInline = (text, onMatrixClick) => {
  if (!text) return null;
  const boldParts = text.split(/\*\*(.*?)\*\*/g);
  return boldParts.map((p, j) => {
    if (j % 2 === 1) {
      // Bold segment
      return onMatrixClick
        ? <strong key={j} className="text-white">{renderInlineWithFrameworks(p, "", onMatrixClick)}</strong>
        : <strong key={j} className="text-white">{p}</strong>;
    }
    // Normal segment
    return onMatrixClick
      ? <span key={j}>{renderInlineWithFrameworks(p, "", onMatrixClick)}</span>
      : <span key={j}>{p}</span>;
  });
};

// ═══ SIMPLE MARKDOWN RENDERER ═══
export const Markdown = ({ text, onMatrixClick }) => {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  for (const line of lines) {
    i++;
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-amber-300 font-semibold text-sm mt-3 mb-1">{onMatrixClick ? renderInlineWithFrameworks(line.slice(3), "", onMatrixClick) : line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-amber-200 font-bold text-base mt-3 mb-1">{onMatrixClick ? renderInlineWithFrameworks(line.slice(2), "", onMatrixClick) : line.slice(2)}</h2>);
    } else if (line.startsWith("- **") || line.startsWith("– **")) {
      const match = line.match(/^[-–]\s*\*\*\[?([^\]*]+)\]?\*\*\s*(.*)/);
      if (match) {
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60 shrink-0">→</span><span><strong className="text-amber-200/90">{onMatrixClick ? renderInlineWithFrameworks(match[1], "", onMatrixClick) : match[1]}</strong> {onMatrixClick ? renderInlineWithFrameworks(match[2], "text-gray-300", onMatrixClick) : <span className="text-gray-300">{match[2]}</span>}</span></div>);
      } else {
        const cleaned = line.replace(/^[-–]\s*/, "").replace(/\*\*/g, "");
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60">→</span>{onMatrixClick ? renderInlineWithFrameworks(cleaned, "text-gray-300", onMatrixClick) : <span className="text-gray-300">{cleaned}</span>}</div>);
      }
    } else if (line.startsWith("- ")) {
      const content = line.slice(2).replace(/\*\*/g, "");
      elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-gray-600">•</span>{onMatrixClick ? renderInlineWithFrameworks(content, "text-gray-300", onMatrixClick) : <span className="text-gray-300">{content}</span>}</div>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-gray-300 my-0.5">{processInline(line, onMatrixClick)}</p>);
    }
  }
  return <div>{elements}</div>;
};
