// ═══ SIMPLE MARKDOWN RENDERER ═══
export const Markdown = ({ text }) => {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;
  for (const line of lines) {
    i++;
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-amber-300 font-semibold text-sm mt-3 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-amber-200 font-bold text-base mt-3 mb-1">{line.slice(2)}</h2>);
    } else if (line.startsWith("- **") || line.startsWith("– **")) {
      const match = line.match(/^[-–]\s*\*\*\[?([^\]*]+)\]?\*\*\s*(.*)/);
      if (match) {
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60 shrink-0">→</span><span><strong className="text-amber-200/90">{match[1]}</strong> <span className="text-gray-300">{match[2]}</span></span></div>);
      } else {
        elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-amber-400/60">→</span><span className="text-gray-300">{line.replace(/^[-–]\s*/, "").replace(/\*\*/g, "")}</span></div>);
      }
    } else if (line.startsWith("- ")) {
      elements.push(<div key={i} className="flex gap-2 ml-2 my-0.5"><span className="text-gray-600">•</span><span className="text-gray-300">{line.slice(2).replace(/\*\*/g, "")}</span></div>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      elements.push(<p key={i} className="text-gray-300 my-0.5">{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-white">{p}</strong> : p)}</p>);
    }
  }
  return <div>{elements}</div>;
};
