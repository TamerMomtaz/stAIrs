import { useState, useMemo } from "react";
import { GOLD, GOLD_L, DEEP, BORDER, glass, inputCls } from "../constants";

export const StrategyQuestionnaire = ({ groups, answers, onAnswer, strategyType, prefilledQuestions }) => {
  const [expandedGroup, setExpandedGroup] = useState(0);

  const isQuestionVisible = (q) => {
    if (!q.conditional_on) return true;
    const { question_id, expected_answer } = q.conditional_on;
    return answers[question_id] === expected_answer;
  };

  const { totalVisible, totalAnswered } = useMemo(() => {
    let visible = 0, answered = 0;
    for (const g of groups) {
      for (const q of g.questions) {
        if (isQuestionVisible(q)) {
          visible++;
          if (answers[q.id] !== undefined && answers[q.id] !== "") answered++;
        }
      }
    }
    return { totalVisible: visible, totalAnswered: answered };
  }, [groups, answers]);

  const progressPercent = totalVisible > 0 ? Math.round((totalAnswered / totalVisible) * 100) : 0;

  const renderInput = (q) => {
    const val = answers[q.id] || "";
    switch (q.type) {
      case "multiple_choice":
        return (
          <div className="flex flex-wrap gap-2 mt-2">
            {(q.options || []).map(opt => (
              <button key={opt} onClick={() => onAnswer(q.id, opt)}
                className={`px-3.5 py-2 rounded-lg text-sm transition-all border ${val === opt
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                  : "bg-[#0a1628]/60 border-[#1e3a5f] text-gray-400 hover:border-gray-500 hover:text-gray-300"}`}>
                {opt}
              </button>
            ))}
          </div>
        );
      case "yes_no":
        return (
          <div className="flex gap-2 mt-2">
            {["Yes", "No"].map(opt => (
              <button key={opt} onClick={() => onAnswer(q.id, opt)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-all border ${val === opt
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
                  : "bg-[#0a1628]/60 border-[#1e3a5f] text-gray-400 hover:border-gray-500 hover:text-gray-300"}`}>
                {opt}
              </button>
            ))}
          </div>
        );
      case "scale":
        return (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[10px] text-gray-600 mr-1">Low</span>
            {["1", "2", "3", "4", "5"].map(n => (
              <button key={n} onClick={() => onAnswer(q.id, n)}
                className={`w-10 h-10 rounded-full text-sm font-semibold transition-all border ${val === n
                  ? "bg-amber-500/25 border-amber-500/50 text-amber-200 scale-110"
                  : "bg-[#0a1628]/60 border-[#1e3a5f] text-gray-500 hover:border-gray-500 hover:text-gray-300"}`}>
                {n}
              </button>
            ))}
            <span className="text-[10px] text-gray-600 ml-1">High</span>
          </div>
        );
      case "short_text":
        return (
          <textarea value={val} onChange={e => onAnswer(q.id, e.target.value)}
            rows={2} placeholder="Type your answer..."
            className={`${inputCls} mt-2 resize-none`} />
        );
      default:
        return (
          <input value={val} onChange={e => onAnswer(q.id, e.target.value)}
            placeholder="Type your answer..." className={`${inputCls} mt-2`} />
        );
    }
  };

  return (
    <div className="space-y-4" data-tutorial="questionnaire">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-1 h-2 rounded-full bg-[#0a1628]/80 border border-[#1e3a5f] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})` }} />
        </div>
        <span className="text-xs text-gray-400 shrink-0 tabular-nums">{totalAnswered}/{totalVisible} answered</span>
      </div>

      {/* Question groups */}
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {groups.map((group, gi) => {
          const visibleQuestions = group.questions.filter(isQuestionVisible);
          if (visibleQuestions.length === 0) return null;
          const isExpanded = expandedGroup === gi;
          const groupAnswered = visibleQuestions.filter(q => answers[q.id] !== undefined && answers[q.id] !== "").length;

          return (
            <div key={gi} className="rounded-xl overflow-hidden" style={glass(0.4)}>
              <button onClick={() => setExpandedGroup(isExpanded ? -1 : gi)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-xs">{isExpanded ? "▾" : "▸"}</span>
                  <span className="text-white text-sm font-semibold">{group.name}</span>
                </div>
                <span className="text-[10px] text-gray-500">
                  {groupAnswered}/{visibleQuestions.length}
                </span>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 space-y-5">
                  {visibleQuestions.map((q, qi) => (
                    <div key={q.id} className="pl-1">
                      <div className="text-sm text-gray-200 leading-relaxed">
                        <span className="text-gray-600 text-xs mr-1.5">{qi + 1}.</span>
                        {q.question}
                      </div>
                      {q.explanation && (
                        <div className="text-[11px] text-gray-500 mt-0.5 italic">{q.explanation}</div>
                      )}
                      {renderInput(q)}
                      {prefilledQuestions?.has(q.id) && answers[q.id] && (
                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-indigo-400/70">
                          <span>🤖</span>
                          <span>Pre-filled from your documents</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
