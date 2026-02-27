import { useState, useEffect, useRef, useCallback } from "react";
import { api, SourcesAPI, extractDocumentText } from "../api";
import { GOLD, GOLD_L, TEAL, DEEP, BORDER, glass, typeColors, typeIcons, inputCls, labelCls } from "../constants";
import { Markdown } from "./Markdown";
import { Modal } from "./SharedUI";
import { StrategyQuestionnaire } from "./StrategyQuestionnaire";

const strategyTypes = [
  { value: "marketing", label: "Marketing Strategy", icon: "📣" },
  { value: "market_entry", label: "Market Entry / Expansion", icon: "🌍" },
  { value: "digital_transformation", label: "Digital Transformation", icon: "⚡" },
  { value: "product_development", label: "Product Development", icon: "🔬" },
  { value: "funding_readiness", label: "Funding & Investment Readiness", icon: "💰" },
  { value: "operations", label: "Operations & Efficiency", icon: "⚙️" },
  { value: "sustainability", label: "Environmental & Sustainability", icon: "🌱" },
  { value: "talent", label: "HR & Talent Strategy", icon: "👥" },
  { value: "sales", label: "Sales Growth", icon: "📈" },
  { value: "brand", label: "Brand Building", icon: "🏷️" },
  { value: "customer_experience", label: "Customer Experience", icon: "❤️" },
  { value: "innovation", label: "Innovation & R&D", icon: "💡" },
  { value: "risk_management", label: "Risk Management", icon: "🛡️" },
  { value: "compliance", label: "Compliance & Governance", icon: "📋" },
  { value: "growth", label: "General Growth Strategy", icon: "🚀" },
];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatQuestionnaireContext = (questionnaireData, answers) => {
  if (!questionnaireData?.groups || Object.keys(answers).length === 0) return "";
  const parts = [];
  for (const group of questionnaireData.groups) {
    const groupAnswers = [];
    for (const q of group.questions) {
      if (answers[q.id] !== undefined && answers[q.id] !== "") {
        groupAnswers.push(`  - Q: ${q.question}\n    A: ${answers[q.id]}`);
      }
    }
    if (groupAnswers.length > 0) {
      parts.push(`${group.name}:\n${groupAnswers.join("\n")}`);
    }
  }
  return parts.length > 0 ? `\n\nSTRATEGY QUESTIONNAIRE ANSWERS:\n${parts.join("\n\n")}` : "";
};

export const StrategyWizard = ({ open, onClose, onCreate, lang }) => {
  // Step 0: Company brief + strategy type
  // Step 1: Upload Documents (Optional) — NEW
  // Step 2: AI questionnaire
  // Step 3: AI chat
  // Step 4: Review & create
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState({ name: "", company: "", industry: "", description: "", strategyType: "", icon: "🎯", color: GOLD });
  const [aiMessages, setAiMessages] = useState([]); const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false); const [generatedElements, setGeneratedElements] = useState([]);
  const [questionnaireData, setQuestionnaireData] = useState(null);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);
  const [questionnaireError, setQuestionnaireError] = useState(null);
  const [retryMsg, setRetryMsg] = useState(null);
  // Document upload state (NEW)
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [extractedTexts, setExtractedTexts] = useState([]);
  const [prefilledQuestionIds, setPrefilledQuestionIds] = useState(new Set());
  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState(null);
  const [prefilling, setPrefilling] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const iconOpts = ["🎯","🌱","🚀","🗝️","💡","🏭","📊","🌍","⚡","🔬","🛡️","🌐"];
  const colorOpts = [GOLD, TEAL, "#60a5fa", "#a78bfa", "#f87171", "#34d399", "#fbbf24", "#ec4899"];
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages]);

  const selectedType = strategyTypes.find(t => t.value === info.strategyType);
  const typeLabel = selectedType?.label || info.strategyType.replace(/_/g, " ");

  // ─── File handling ───
  const validateFile = (file) => {
    const name = file.name || "";
    const ext = name.includes(".") ? "." + name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `Unsupported file type '${ext}'`;
    if (file.size > MAX_FILE_SIZE) return "File size exceeds 10MB limit";
    return null;
  };

  const handleAddFiles = useCallback((newFiles) => {
    const valid = [];
    for (const file of newFiles) {
      const err = validateFile(file);
      if (err) {
        setExtractionError(err);
        continue;
      }
      // Avoid duplicates by name+size
      if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
        valid.push(file);
      }
    }
    if (valid.length > 0) {
      setUploadedFiles(prev => [...prev, ...valid]);
      setExtractionError(null);
    }
  }, [uploadedFiles]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) handleAddFiles(files);
  }, [handleAddFiles]);

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleAddFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Step navigation ───
  const goToUploadStep = () => {
    if (!info.name.trim() || !info.strategyType) return;
    setStep(1);
  };

  const goToQuestionnaire = async (docTexts = null) => {
    if (!info.name.trim() || !info.strategyType) return;
    const textsToUse = docTexts || extractedTexts;
    setStep(2);
    setQuestionnaireLoading(true);
    setQuestionnaireError(null);
    try {
      const res = await api.aiPost("/api/v1/ai/questionnaire", {
        company_name: info.company || info.name,
        company_brief: info.description || null,
        industry: info.industry || null,
        strategy_type: info.strategyType,
      }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`));
      setRetryMsg(null);
      setQuestionnaireData(res);
      setQuestionnaireLoading(false);

      // Pre-fill from documents if available
      if (textsToUse && textsToUse.length > 0) {
        const combinedText = textsToUse
          .filter(d => d.text)
          .map(d => `--- ${d.filename} ---\n${d.text}`)
          .join("\n\n");
        if (combinedText.trim()) {
          setPrefilling(true);
          try {
            const prefillRes = await api.aiPost("/api/v1/ai/prefill-questionnaire", {
              company_name: info.company || info.name,
              company_brief: info.description || null,
              industry: info.industry || null,
              strategy_type: info.strategyType,
              document_text: combinedText,
              groups: res.groups,
            }, (attempt, max) => setRetryMsg(`Pre-filling answers... retrying (${attempt}/${max})`));
            setRetryMsg(null);

            if (prefillRes?.answers) {
              // Validate answers against question types
              const validatedAnswers = {};
              const prefilledIds = new Set();
              for (const group of res.groups) {
                for (const q of group.questions) {
                  const answer = prefillRes.answers[q.id];
                  if (answer === undefined || answer === null || String(answer).trim() === "") continue;
                  const ansStr = String(answer);
                  if (q.type === "multiple_choice" && q.options) {
                    if (q.options.includes(ansStr)) { validatedAnswers[q.id] = ansStr; prefilledIds.add(q.id); }
                  } else if (q.type === "yes_no") {
                    if (["Yes", "No"].includes(ansStr)) { validatedAnswers[q.id] = ansStr; prefilledIds.add(q.id); }
                  } else if (q.type === "scale") {
                    if (["1", "2", "3", "4", "5"].includes(ansStr)) { validatedAnswers[q.id] = ansStr; prefilledIds.add(q.id); }
                  } else {
                    validatedAnswers[q.id] = ansStr; prefilledIds.add(q.id);
                  }
                }
              }
              setQuestionnaireAnswers(validatedAnswers);
              setPrefilledQuestionIds(prefilledIds);
            }
          } catch (e) {
            setRetryMsg(null);
            console.warn("Prefill failed (non-critical):", e.message);
          }
          setPrefilling(false);
        }
      }
    } catch (e) {
      setRetryMsg(null);
      setQuestionnaireError(e.message);
      setQuestionnaireLoading(false);
    }
  };

  const handleSkipUpload = () => {
    goToQuestionnaire([]);
  };

  const handleUploadAndContinue = async () => {
    if (uploadedFiles.length === 0) return;
    setExtracting(true);
    setExtractionError(null);
    try {
      const result = await extractDocumentText(uploadedFiles);
      const texts = result.documents || [];
      setExtractedTexts(texts);
      setExtracting(false);
      await goToQuestionnaire(texts);
    } catch (e) {
      setExtracting(false);
      setExtractionError(e.message || "Failed to extract text from documents");
    }
  };

  const skipQuestionnaire = () => {
    setStep(3);
    const stratContext = info.strategyType ? ` Strategy type: ${typeLabel}.` : "";
    setAiMessages([{ role: "ai", text: `Great! Let's build the **${typeLabel}** strategy for **${info.company || info.name}**.${stratContext}\n\nTell me about your business goals, challenges, and what you want to achieve.\n\nExamples:\n- "We want to expand across the MENA region"\n- "Our goal is $5M ARR by 2027"` }]);
  };

  const goToAIChat = () => {
    setStep(3);
    const qContext = formatQuestionnaireContext(questionnaireData, questionnaireAnswers);
    const answeredCount = Object.values(questionnaireAnswers).filter(v => v !== "").length;
    const introNote = answeredCount > 0 ? `\n\nI've reviewed your ${answeredCount} questionnaire answers and will use them to build a more targeted strategy.` : "";
    setAiMessages([{ role: "ai", text: `Great! Let's build the **${typeLabel}** strategy for **${info.company || info.name}**.${introNote}\n\nTell me about your business goals, challenges, and what you want to achieve. Or click the button below to generate the staircase directly.\n\nExamples:\n- "We want to expand across the MENA region"\n- "Our goal is $5M ARR by 2027"` }]);
  };

  const sendToAI = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim(); setAiInput("");
    setAiMessages(prev => [...prev, { role: "user", text: msg }]); setAiLoading(true);
    try {
      const qContext = formatQuestionnaireContext(questionnaireData, questionnaireAnswers);
      const contextMessage = `[CONTEXT: Creating ${typeLabel} strategy "${info.name}" for "${info.company || info.name}" in ${info.industry || "unspecified"} industry. ${info.description || ""}${qContext}\nGenerate structured strategy elements. Cite sources when referencing frameworks or research.]\n\nUser: ${msg}`;
      const res = await api.aiPost("/api/v1/ai/chat", { message: contextMessage }, (attempt, max) => setRetryMsg(`AI is thinking... retrying (${attempt}/${max})`));
      setRetryMsg(null);
      setAiMessages(prev => [...prev, { role: "ai", text: res.response, tokens: res.tokens_used }]);
      const extracted = extractElements(res.response);
      if (extracted.length > 0) setGeneratedElements(prev => [...prev, ...extracted]);
    } catch (e) { setRetryMsg(null); setAiMessages(prev => [...prev, { role: "ai", text: `Warning: ${e.message}`, error: true }]); }
    setAiLoading(false);
  };

  const extractElements = (text) => {
    const elements = []; const lines = text.split("\n");
    for (const line of lines) {
      const clean = line.replace(/\*\*/g, "").replace(/^[-–•]\s*/, "").trim();
      if (!clean) continue;
      let m;
      m = clean.match(/\[?Vision\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "vision", title: m[1].trim(), _num: "V" }); continue; }
      m = clean.match(/\[?Objective\s*(\d+)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "objective", title: m[2].trim(), _num: m[1] }); continue; }
      m = clean.match(/\[?(?:Key Result|KR)\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "key_result", title: m[3].trim(), _num: `${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
      m = clean.match(/\[?Initiative\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "initiative", title: m[3].trim(), _num: `I${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
      m = clean.match(/\[?Task\s*(\d+)\.?(\d*)\]?\s*[:;–-]\s*(.+)/i); if (m) { elements.push({ element_type: "task", title: m[3].trim(), _num: `T${m[1]}.${m[2]||"0"}`, _parentNum: m[1] }); continue; }
    }
    return elements;
  };

  const askForStrategy = () => {
    const qContext = formatQuestionnaireContext(questionnaireData, questionnaireAnswers);
    const enrichment = qContext ? `\n\nUse these questionnaire answers to make the strategy specific and actionable:${qContext}` : "";
    setAiInput(`Based on our discussion, generate a complete ${typeLabel} strategic staircase for ${info.company || info.name}.${enrichment}\n\nFormat:\n[Vision]: ...\n[Objective 1]: ...\n[KR 1.1]: ...\n[Initiative 1.1]: ...\nBe specific and tailored to this ${typeLabel.toLowerCase()} context.`);
  };

  const finishWizard = async () => {
    const localElements = [];
    if (generatedElements.length > 0) {
      const codePrefix = { vision: "VIS", objective: "OBJ", key_result: "KR", initiative: "INI", task: "TSK" };
      const els = generatedElements.map((el, i) => ({ ...el, id: `el_${Date.now()}_${i}`, code: `${codePrefix[el.element_type]||"EL"}-${String(i+1).padStart(3,"0")}`, health: "on_track", progress_percent: 0, parent_id: null }));
      const visionId = els.find(e => e.element_type === "vision")?.id;
      const objMap = {};
      els.forEach(el => { if (el.element_type === "objective") { el.parent_id = visionId || null; objMap[el._num] = el.id; } });
      els.forEach(el => { if (["key_result","initiative","task"].includes(el.element_type)) { if (el._parentNum && objMap[el._parentNum]) el.parent_id = objMap[el._parentNum]; else { const lo = [...els].reverse().find(e => e.element_type === "objective"); el.parent_id = lo?.id || visionId || null; } } });
      els.forEach(el => { delete el._num; delete el._parentNum; });
      localElements.push(...els);
    }
    // Collect sources for Source of Truth logging
    const pendingSources = [];
    // Log questionnaire answers (whether pre-filled or manual)
    if (questionnaireData?.groups && Object.keys(questionnaireAnswers).length > 0) {
      for (const group of questionnaireData.groups) {
        for (const q of group.questions) {
          if (questionnaireAnswers[q.id] !== undefined && questionnaireAnswers[q.id] !== "") {
            pendingSources.push({
              source_type: "questionnaire",
              content: `Q: ${q.question}\nA: ${questionnaireAnswers[q.id]}`,
              metadata: { context: "questionnaire_answer", question: q.question, answer: questionnaireAnswers[q.id], group: group.name, question_id: q.id },
            });
          }
        }
      }
    }
    // Log AI pre-fill extraction source
    if (prefilledQuestionIds.size > 0 && extractedTexts.length > 0) {
      const prefilledEntries = [];
      if (questionnaireData?.groups) {
        for (const group of questionnaireData.groups) {
          for (const q of group.questions) {
            if (prefilledQuestionIds.has(q.id) && questionnaireAnswers[q.id]) {
              prefilledEntries.push(`Q: ${q.question}\nA: ${questionnaireAnswers[q.id]}`);
            }
          }
        }
      }
      pendingSources.push({
        source_type: "ai_extraction",
        content: `AI pre-filled ${prefilledQuestionIds.size} questionnaire answers from uploaded documents:\n\n${prefilledEntries.join("\n\n")}`,
        metadata: {
          context: "ai_extraction",
          source: "document_prefill",
          document_filenames: extractedTexts.map(d => d.filename),
          prefilled_question_count: prefilledQuestionIds.size,
        },
      });
    }
    // Log AI chat messages from wizard
    const userMsgs = aiMessages.filter(m => m.role === "user");
    const aiMsgs = aiMessages.filter(m => m.role === "ai" && !m.error);
    if (userMsgs.length > 0) {
      pendingSources.push({
        source_type: "ai_chat",
        content: `Strategy Wizard AI Chat (${userMsgs.length} user messages, ${aiMsgs.length} AI responses):\n\n${aiMessages.filter(m => !m.error).map(m => `${m.role === "user" ? "User" : "AI"}: ${m.text.slice(0, 300)}`).join("\n\n")}`,
        metadata: { context: "strategy_wizard_chat", user_message_count: userMsgs.length, ai_response_count: aiMsgs.length },
      });
    }

    await onCreate({ name: info.name, company: info.company || info.name, description: info.description, icon: info.icon, color: info.color, industry: info.industry, _localElements: localElements, _pendingSources: pendingSources, _pendingDocumentFiles: uploadedFiles.length > 0 ? uploadedFiles : null });
    resetWizard();
  };

  const resetWizard = () => {
    setStep(0);
    setInfo({ name: "", company: "", industry: "", description: "", strategyType: "", icon: "🎯", color: GOLD });
    setAiMessages([]); setGeneratedElements([]);
    setQuestionnaireData(null); setQuestionnaireAnswers({}); setQuestionnaireError(null);
    setUploadedFiles([]); setExtractedTexts([]); setPrefilledQuestionIds(new Set());
    setExtracting(false); setExtractionError(null); setPrefilling(false);
    onClose();
  };

  const stepTitles = ["New Strategy", "Upload Documents", "Strategy Questionnaire", "AI Strategy Builder", "Review & Create"];

  return (
    <Modal open={open} onClose={onClose} title={stepTitles[step] || "New Strategy"} wide={step > 0} data-tutorial="strategy-wizard">
      {/* ═══ STEP 0: Company Brief + Strategy Type ═══ */}
      {step === 0 && (
        <div className="space-y-4">
          <div><label className={labelCls}>Strategy Name *</label><input value={info.name} onChange={e => setInfo(f => ({...f, name: e.target.value}))} placeholder="e.g., Growth Plan 2026" className={inputCls} /></div>
          <div><label className={labelCls}>Company / Product</label><input value={info.company} onChange={e => setInfo(f => ({...f, company: e.target.value}))} className={inputCls} /></div>
          <div><label className={labelCls}>Industry</label><input value={info.industry} onChange={e => setInfo(f => ({...f, industry: e.target.value}))} className={inputCls} /></div>
          <div><label className={labelCls}>Brief Description</label><textarea value={info.description} onChange={e => setInfo(f => ({...f, description: e.target.value}))} rows={2} className={`${inputCls} resize-none`} placeholder="Describe your company, current situation, and what you're trying to achieve..." /></div>

          {/* Strategy Type Selector */}
          <div>
            <label className={labelCls}>Strategy Type *</label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {strategyTypes.map(t => (
                <button key={t.value} onClick={() => setInfo(f => ({...f, strategyType: t.value}))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-all border ${info.strategyType === t.value
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                    : "bg-[#0a1628]/60 border-[#1e3a5f] text-gray-400 hover:border-gray-500 hover:text-gray-300"}`}>
                  <span className="text-base shrink-0">{t.icon}</span>
                  <span className="truncate text-xs">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-6">
            <div><label className={labelCls}>Icon</label><div className="flex flex-wrap gap-1.5">{iconOpts.map(ic => <button key={ic} onClick={() => setInfo(f => ({...f, icon: ic}))} className={`w-9 h-9 rounded-lg text-base flex items-center justify-center transition ${info.icon===ic ? "bg-amber-500/20 border border-amber-500/40 scale-110" : "bg-[#0a1628]/60 border border-[#1e3a5f]"}`}>{ic}</button>)}</div></div>
            <div><label className={labelCls}>Color</label><div className="flex flex-wrap gap-1.5">{colorOpts.map(c => <button key={c} onClick={() => setInfo(f => ({...f, color: c}))} className={`w-7 h-7 rounded-full transition ${info.color===c ? "scale-125 ring-2 ring-white/30" : "hover:scale-110"}`} style={{ background: c }} />)}</div></div>
          </div>
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">Cancel</button>
            <button onClick={goToUploadStep} disabled={!info.name.trim() || !info.strategyType} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Next → Strategy Questionnaire</button>
          </div>
        </div>
      )}

      {/* ═══ STEP 1: Upload Documents (Optional) — NEW ═══ */}
      {step === 1 && (
        <div className="flex flex-col" style={{ minHeight: "50vh" }}>
          <div className="flex-1">
            <div className="mb-4">
              <p className="text-gray-300 text-sm mb-1">Have a business plan, pitch deck, or market research? Upload it and we'll pre-fill your strategy questionnaire.</p>
              <p className="text-gray-500 text-xs">You can skip this step and fill the questionnaire manually.</p>
            </div>

            {/* Drag & drop zone */}
            <div
              onDrop={handleFileDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onClick={() => !extracting && fileInputRef.current?.click()}
              className={`relative rounded-xl p-8 text-center cursor-pointer transition-all border-2 border-dashed ${dragOver ? "scale-[1.01]" : "hover:scale-[1.005]"}`}
              style={{
                borderColor: dragOver ? "#f472b6" : BORDER,
                background: dragOver ? "rgba(244, 114, 182, 0.05)" : "rgba(22, 37, 68, 0.3)",
              }}
            >
              {extracting ? (
                <div className="space-y-3">
                  <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
                  <div className="text-sm text-gray-400">Extracting text from documents...</div>
                </div>
              ) : (
                <>
                  <div className="text-2xl mb-2">{dragOver ? "📥" : "📎"}</div>
                  <div className="text-sm text-gray-400">
                    {dragOver ? "Drop files here" : "Drag & drop files here, or click to browse"}
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1.5">
                    PDF, DOCX, XLSX, CSV, TXT, PNG, JPG — Max 10MB per file
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(",")}
              onChange={handleFileInput}
              className="hidden"
              multiple
            />

            {/* Extraction error */}
            {extractionError && (
              <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 text-xs">
                <span className="flex-1">{extractionError}</span>
                <button onClick={() => setExtractionError(null)} className="hover:text-red-300">✕</button>
              </div>
            )}

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-xs text-gray-400 mb-2">{uploadedFiles.length} file{uploadedFiles.length > 1 ? "s" : ""} selected</div>
                {uploadedFiles.map((file, i) => (
                  <div key={`${file.name}-${i}`} className="flex items-center gap-3 p-2.5 rounded-lg" style={glass(0.4)}>
                    <span className="text-base shrink-0">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-200 truncate">{file.name}</div>
                      <div className="text-[10px] text-gray-500">{formatFileSize(file.size)}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-gray-600 hover:text-red-400 text-xs shrink-0 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 pt-4 mt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <div className="flex justify-between">
              <button onClick={() => { setStep(0); setUploadedFiles([]); setExtractionError(null); }} className="text-xs text-gray-500 hover:text-gray-300 transition">← Back</button>
              <div className="flex gap-3">
                <button onClick={handleSkipUpload} disabled={extracting} className="px-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700 transition disabled:opacity-40">Skip — Fill Manually</button>
                <button onClick={handleUploadAndContinue} disabled={uploadedFiles.length === 0 || extracting} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] disabled:opacity-40 transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Upload & Continue</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: AI Questionnaire ═══ */}
      {step === 2 && (
        <div className="flex flex-col" style={{ minHeight: "50vh" }}>
          {questionnaireLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
              <div className="w-10 h-10 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <div className="text-gray-400 text-sm">{retryMsg || <>Generating tailored questions for your <span className="text-amber-300">{typeLabel}</span> strategy...</>}</div>
            </div>
          ) : questionnaireError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
              <div className="text-red-400 text-sm">Failed to generate questionnaire: {questionnaireError}</div>
              <button onClick={() => goToQuestionnaire(extractedTexts)} className="px-4 py-2 rounded-lg text-sm text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition">Retry</button>
            </div>
          ) : questionnaireData ? (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-4 p-3 rounded-lg" style={glass(0.3)}>
                <span className="text-base">{selectedType?.icon}</span>
                <span className="text-sm text-gray-300">{typeLabel} Strategy</span>
                <span className="text-gray-600 mx-1">for</span>
                <span className="text-sm text-white font-medium">{info.company || info.name}</span>
              </div>
              {/* Pre-filling indicator */}
              {prefilling && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-900/20 border border-indigo-700/30 mb-4">
                  <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-xs text-indigo-300">{retryMsg || "Pre-filling answers from your documents..."}</span>
                </div>
              )}
              {/* Pre-fill success notice */}
              {!prefilling && prefilledQuestionIds.size > 0 && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-indigo-900/15 border border-indigo-700/20 mb-4">
                  <span className="text-indigo-400 text-xs">✓ {prefilledQuestionIds.size} answers pre-filled from your documents. Review and edit as needed.</span>
                </div>
              )}
              <StrategyQuestionnaire
                groups={questionnaireData.groups}
                answers={questionnaireAnswers}
                onAnswer={(id, val) => setQuestionnaireAnswers(prev => ({ ...prev, [id]: val }))}
                strategyType={info.strategyType}
                prefilledQuestions={prefilledQuestionIds}
              />
            </div>
          ) : null}

          <div className="shrink-0 pt-4 mt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            {!questionnaireLoading && !questionnaireError && questionnaireData && (
              <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <span className="text-amber-500/60 text-xs">i</span>
                <span className="text-[11px] text-gray-500">Answering these questions will make your strategy significantly more accurate.</span>
              </div>
            )}
            <div className="flex justify-between">
              <button onClick={() => { setStep(1); setQuestionnaireData(null); setQuestionnaireAnswers({}); setQuestionnaireError(null); setPrefilledQuestionIds(new Set()); setPrefilling(false); }} className="text-xs text-gray-500 hover:text-gray-300 transition">← Back</button>
              <div className="flex gap-3">
                <button onClick={skipQuestionnaire} className="px-4 py-2 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-transparent hover:border-gray-700 transition">Skip questionnaire</button>
                {!questionnaireLoading && questionnaireData && (
                  <button onClick={goToAIChat} disabled={prefilling} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] transition-all hover:scale-[1.02] disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Next → AI Builder</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: AI Chat ═══ */}
      {step === 3 && (
        <div className="flex flex-col" style={{ height: "60vh" }}>
          <div className="flex-1 overflow-y-auto space-y-3 pb-4 min-h-0">
            {aiMessages.map((m, i) => (<div key={i} className={`flex ${m.role==="user"?"justify-end":"justify-start"}`}><div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed ${m.role==="user"?"bg-amber-500/20 text-amber-100 rounded-br-md":m.error?"bg-red-500/10 text-red-300 rounded-bl-md border border-red-500/20":"bg-[#162544] text-gray-200 rounded-bl-md border border-[#1e3a5f]"}`}>{m.role==="ai"?<Markdown text={m.text}/>:<div className="whitespace-pre-wrap">{m.text}</div>}</div></div>))}
            {aiLoading && <div className="flex items-center gap-2 px-4 py-2">{[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-amber-500/40 animate-bounce" style={{ animationDelay:`${i*0.15}s` }} />)}{retryMsg && <span className="text-amber-400/80 text-xs ml-1">{retryMsg}</span>}</div>}
            <div ref={endRef} />
          </div>
          {generatedElements.length > 0 && (<div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg" style={glass(0.3)}><span className="text-amber-400 text-xs">✓ {generatedElements.length} elements captured</span><div className="flex-1"/><button onClick={() => setStep(4)} className="text-xs px-3 py-1 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition">Review & Create →</button></div>)}
          {aiMessages.length >= 1 && generatedElements.length === 0 && (<div className="mb-2"><button onClick={askForStrategy} className="text-xs px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-400/80 hover:bg-amber-500/10 transition">✨ Ask AI to generate the staircase now</button></div>)}
          <div className="shrink-0 flex gap-2 pt-2">
            <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendToAI(); } }} placeholder="Describe your goals... (Shift+Enter for new line)" disabled={aiLoading} rows={2} className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628]/60 border border-[#1e3a5f] text-white placeholder-gray-600 focus:border-amber-500/40 focus:outline-none transition text-sm resize-none" />
            <button onClick={sendToAI} disabled={aiLoading||!aiInput.trim()} className="px-5 py-3 rounded-xl font-medium text-sm disabled:opacity-30 transition-all hover:scale-105 self-end" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>Send</button>
          </div>
          <div className="flex justify-between mt-3"><button onClick={() => setStep(questionnaireData ? 2 : 1)} className="text-xs text-gray-500 hover:text-gray-300 transition">← Back</button><button onClick={() => setStep(4)} className="text-xs text-gray-500 hover:text-gray-300 transition">Skip AI → Create empty</button></div>
        </div>
      )}

      {/* ═══ STEP 4: Review & Create ═══ */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl" style={glass(0.4)}>
            <span className="text-2xl">{info.icon}</span>
            <div>
              <div className="text-white font-semibold">{info.name}</div>
              <div className="text-gray-500 text-xs">{info.company} {info.industry ? `· ${info.industry}` : ""} {typeLabel ? `· ${typeLabel}` : ""}</div>
            </div>
          </div>
          {uploadedFiles.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={glass(0.2)}>
              <span className="text-pink-400 text-xs">📄 {uploadedFiles.length} document{uploadedFiles.length > 1 ? "s" : ""} will be saved to Source of Truth</span>
            </div>
          )}
          {Object.keys(questionnaireAnswers).length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={glass(0.2)}>
              <span className="text-teal-400 text-xs">✓ {Object.values(questionnaireAnswers).filter(v => v !== "").length} questionnaire answers included{prefilledQuestionIds.size > 0 ? ` (${prefilledQuestionIds.size} pre-filled from documents)` : ""}</span>
            </div>
          )}
          {generatedElements.length > 0 ? (<div><label className={labelCls}>{generatedElements.length} elements will be created:</label><div className="max-h-60 overflow-y-auto space-y-1 p-3 rounded-lg" style={glass(0.3)}>{generatedElements.map((el,i) => (<div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded" style={{ borderLeft: `2px solid ${typeColors[el.element_type]||"#94a3b8"}` }}><span style={{ color: typeColors[el.element_type], fontSize: 12 }}>{typeIcons[el.element_type]}</span><span className="text-[10px] text-gray-500 uppercase w-16 shrink-0">{el.element_type.replace("_"," ")}</span><span className="text-sm text-gray-200 truncate">{el.title}</span><button onClick={() => setGeneratedElements(prev => prev.filter((_,j) => j!==i))} className="ml-auto text-gray-600 hover:text-red-400 text-xs shrink-0">✕</button></div>))}</div></div>) : (<div className="text-gray-500 text-sm text-center py-6">No elements generated. Add them manually after creation.</div>)}
          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}><button onClick={() => setStep(3)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">← Back to AI</button><button onClick={finishWizard} className="px-5 py-2 rounded-lg text-sm font-semibold text-[#0a1628] transition-all hover:scale-[1.02]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>Create Strategy {generatedElements.length > 0 ? `(${generatedElements.length} el)` : ""}</button></div>
        </div>
      )}
    </Modal>
  );
};
