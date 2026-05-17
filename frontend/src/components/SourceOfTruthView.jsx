import { useState, useEffect, useRef, useCallback } from "react";
import { SourcesAPI, DataQaAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, inputCls } from "../constants";
import { fireGuidance } from "../guidanceConfig";

const sourceTypeConfig = {
  questionnaire: { icon: "📋", label: "Questionnaire", labelAr: "استبيان", color: "#60a5fa" },
  ai_chat: { icon: "🤖", label: "AI Chat", labelAr: "محادثة AI", color: "#a78bfa" },
  feedback: { icon: "💬", label: "Feedback", labelAr: "ملاحظات", color: "#34d399" },
  manual_entry: { icon: "📝", label: "Manual Entry", labelAr: "إدخال يدوي", color: "#fbbf24" },
  document: { icon: "📄", label: "Documents", labelAr: "مستندات", color: "#f472b6" },
  ai_extraction: { icon: "🔬", label: "AI Extraction", labelAr: "استخراج AI", color: "#818cf8" },
};

const sourceTypes = ["questionnaire", "ai_chat", "feedback", "manual_entry", "document", "ai_extraction"];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const SourceOfTruthView = ({ lang, strategyContext }) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fullTextId, setFullTextId] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [analysisReviewId, setAnalysisReviewId] = useState(null);
  const [analysisData, setAnalysisData] = useState({});
  const [rejectedItems, setRejectedItems] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [approving, setApproving] = useState(false);
  // Data QA state
  const [confidenceMap, setConfidenceMap] = useState({});
  const [showQuarantine, setShowQuarantine] = useState(false);
  const [quarantinedSources, setQuarantinedSources] = useState([]);
  const [impactData, setImpactData] = useState(null);
  const [impactSourceId, setImpactSourceId] = useState(null);
  const [quarantineConfirm, setQuarantineConfirm] = useState(null);
  const [dataHealth, setDataHealth] = useState(null);
  const isAr = lang === "ar";
  const searchTimer = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (strategyContext?.id) loadSources();
  }, [strategyContext?.id, filter, searchDebounced]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchDebounced(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Load confidence scores and data health
  useEffect(() => {
    if (!strategyContext?.id) return;
    DataQaAPI.getConfidenceScores(strategyContext.id)
      .then(data => {
        const map = {};
        (data || []).forEach(c => { map[c.source_id] = c; });
        setConfidenceMap(map);
      })
      .catch(() => {});
    DataQaAPI.getDataHealth(strategyContext.id)
      .then(d => setDataHealth(d))
      .catch(() => {});
  }, [strategyContext?.id, sources.length]);

  const loadQuarantined = async () => {
    if (!strategyContext?.id) return;
    try {
      const data = await DataQaAPI.getQuarantinedSources(strategyContext.id);
      setQuarantinedSources(data || []);
    } catch { setQuarantinedSources([]); }
  };

  const handleQuarantine = async (sourceId, reason) => {
    if (!strategyContext?.id) return;
    try {
      await DataQaAPI.quarantineSource(strategyContext.id, sourceId, reason);
      setQuarantineConfirm(null);
      loadSources();
      loadQuarantined();
    } catch (e) { console.error("Quarantine failed:", e); }
  };

  const handleRestore = async (sourceId) => {
    if (!strategyContext?.id) return;
    try {
      await DataQaAPI.restoreSource(strategyContext.id, sourceId);
      loadSources();
      loadQuarantined();
    } catch (e) { console.error("Restore failed:", e); }
  };

  const handleVerify = async (sourceId) => {
    if (!strategyContext?.id) return;
    try {
      await DataQaAPI.verifySource(strategyContext.id, sourceId);
      loadSources();
    } catch (e) { console.error("Verify failed:", e); }
  };

  const handleTraceImpact = async (sourceId) => {
    if (!strategyContext?.id) return;
    try {
      const data = await DataQaAPI.traceImpact(strategyContext.id, sourceId);
      setImpactData(data);
      setImpactSourceId(sourceId);
    } catch (e) { console.error("Impact trace failed:", e); }
  };

  const getConfidenceBadge = (sourceId) => {
    const conf = confidenceMap[sourceId];
    if (!conf) return null;
    const colors = {
      high: "text-emerald-400 bg-emerald-900/30 border-emerald-700/40",
      medium: "text-amber-400 bg-amber-900/30 border-amber-700/40",
      low: "text-red-400 bg-red-900/30 border-red-700/40",
      quarantined: "text-gray-400 bg-gray-900/30 border-gray-700/40",
    };
    const levelLabel = { high: isAr ? "عالي" : "High", medium: isAr ? "متوسط" : "Med", low: isAr ? "منخفض" : "Low", quarantined: isAr ? "محجور" : "Q" };
    const cls = colors[conf.confidence_level] || colors.medium;
    return (
      <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${cls}`} title={`Confidence: ${conf.confidence_score}%`}>
        {conf.confidence_score}% {levelLabel[conf.confidence_level] || ""}
      </span>
    );
  };

  const getVerificationBadge = (source) => {
    const meta = source.metadata || {};
    if (meta.quarantined) return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-900/30 text-gray-400 border border-gray-700/40">🚫 {isAr ? "محجور" : "Quarantined"}</span>;
    if (meta.verification_status === "disputed") return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-700/40">⚠️ {isAr ? "متنازع" : "Disputed"}</span>;
    if (meta.user_verified) return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-700/40">✓ {isAr ? "موثق" : "Verified"}</span>;
    return null;
  };

  const loadSources = async () => {
    if (!strategyContext?.id) return;
    setLoading(true);
    try {
      const opts = {};
      if (filter) opts.sourceType = filter;
      if (searchDebounced) opts.search = searchDebounced;
      const data = await SourcesAPI.list(strategyContext.id, opts);
      setSources(data || []);
    } catch (e) {
      console.error("Load sources:", e);
      setSources([]);
    }
    setLoading(false);
  };

  const addManualSource = async () => {
    if (!newContent.trim() || !strategyContext?.id) return;
    try {
      await SourcesAPI.create(strategyContext.id, "manual_entry", newContent.trim(), {
        context: "manual_reference",
      });
      setNewContent("");
      setShowAddModal(false);
      loadSources();
    } catch (e) {
      console.error("Add source:", e);
    }
  };

  const deleteSource = async (sourceId, isDocument) => {
    if (!strategyContext?.id) return;
    try {
      if (isDocument) {
        await SourcesAPI.removeWithFile(strategyContext.id, sourceId);
      } else {
        await SourcesAPI.remove(strategyContext.id, sourceId);
      }
      setSources(prev => prev.filter(s => s.id !== sourceId));
    } catch (e) {
      console.error("Delete source:", e);
    }
  };

  const validateFile = (file) => {
    const name = file.name || "";
    const ext = name.includes(".") ? "." + name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return isAr
        ? `نوع الملف '${ext}' غير مدعوم. الأنواع المدعومة: ${ALLOWED_EXTENSIONS.join(", ")}`
        : `Unsupported file type '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return isAr ? "حجم الملف يتجاوز 10MB" : "File size exceeds 10MB limit";
    }
    return null;
  };

  const handleUpload = useCallback(async (file) => {
    if (!strategyContext?.id || !file) return;
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");
    try {
      await SourcesAPI.uploadDocument(strategyContext.id, file, (pct) => setUploadProgress(pct));
      setUploadProgress(100);
      loadSources();
      fireGuidance("source_uploaded");
    } catch (e) {
      setUploadError(e.message || (isAr ? "فشل الرفع" : "Upload failed"));
    }
    setUploading(false);
  }, [strategyContext?.id]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (e, source) => {
    e.stopPropagation();
    try {
      const data = await SourcesAPI.getDownloadUrl(strategyContext.id, source.id);
      if (data?.download_url) window.open(data.download_url, "_blank");
    } catch (err) {
      console.error("Download:", err);
    }
  };

  const handleAnalyze = async (e, source) => {
    e.stopPropagation();
    if (analyzingId) return;
    setAnalyzingId(source.id);
    try {
      const updated = await SourcesAPI.analyzeDocument(strategyContext.id, source.id);
      const analysis = (updated?.metadata || {}).ai_analysis;
      if (analysis) {
        setAnalysisData(prev => ({ ...prev, [source.id]: analysis }));
        setAnalysisReviewId(source.id);
        setRejectedItems({});
        // Expand all categories by default
        const cats = Object.keys(analysis.categories || {});
        const expanded = {};
        cats.forEach(c => { expanded[c] = true; });
        setExpandedCategories(expanded);
        // Update source in local state
        setSources(prev => prev.map(s => s.id === source.id ? { ...s, metadata: updated.metadata } : s));
      }
    } catch (err) {
      console.error("Analyze failed:", err);
    }
    setAnalyzingId(null);
  };

  const toggleItemRejected = (category, idx) => {
    const key = `${category}::${idx}`;
    setRejectedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getApprovedItems = (sourceId) => {
    const analysis = analysisData[sourceId];
    if (!analysis?.categories) return [];
    const items = [];
    Object.entries(analysis.categories).forEach(([category, data]) => {
      (data.items || []).forEach((item, idx) => {
        const key = `${category}::${idx}`;
        if (!rejectedItems[key]) {
          items.push({ category, text: item.text, confidence: item.confidence });
        }
      });
    });
    return items;
  };

  const handleApproveSelected = async (sourceId) => {
    const items = getApprovedItems(sourceId);
    if (!items.length) return;
    setApproving(true);
    try {
      await SourcesAPI.approveExtractions(strategyContext.id, sourceId, items);
      setAnalysisReviewId(null);
      loadSources();
    } catch (err) {
      console.error("Approve failed:", err);
    }
    setApproving(false);
  };

  const handleApproveAll = async (sourceId) => {
    setRejectedItems({});
    // Need to wait a tick for state to clear, then approve
    const analysis = analysisData[sourceId];
    if (!analysis?.categories) return;
    const items = [];
    Object.entries(analysis.categories).forEach(([category, data]) => {
      (data.items || []).forEach((item) => {
        items.push({ category, text: item.text, confidence: item.confidence });
      });
    });
    if (!items.length) return;
    setApproving(true);
    try {
      await SourcesAPI.approveExtractions(strategyContext.id, sourceId, items);
      setAnalysisReviewId(null);
      loadSources();
    } catch (err) {
      console.error("Approve all failed:", err);
    }
    setApproving(false);
  };

  const totalExtractionItems = (sourceId) => {
    const analysis = analysisData[sourceId];
    if (!analysis?.categories) return 0;
    return Object.values(analysis.categories).reduce((sum, d) => sum + (d.items || []).length, 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return isAr ? "الآن" : "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${isAr ? " دقيقة" : "m ago"}`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${isAr ? " ساعة" : "h ago"}`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}${isAr ? " يوم" : "d ago"}`;
    return d.toLocaleDateString(isAr ? "ar" : "en", { month: "short", day: "numeric", year: "numeric" });
  };

  const getContextLabel = (source) => {
    const meta = source.metadata || {};
    if (meta.context === "questionnaire_answer") return meta.question?.slice(0, 60) || "";
    if (meta.context === "ai_advisor") return isAr ? "المستشار AI" : "AI Advisor";
    if (meta.context === "strategy_generation") return isAr ? "توليد الاستراتيجية" : "Strategy Generation";
    if (meta.context === "risk_analysis") return meta.stair_title || (isAr ? "تحليل المخاطر" : "Risk Analysis");
    if (meta.context === "action_plan") return isAr ? "خطة العمل" : "Action Plan";
    if (meta.context === "feedback_response") return meta.stair_title || (isAr ? "ملاحظات التنفيذ" : "Execution Feedback");
    if (meta.context === "manual_reference") return isAr ? "مرجع يدوي" : "Manual Reference";
    if (meta.context === "document_upload") return meta.filename || (isAr ? "مستند" : "Document");
    if (meta.context === "ai_extraction") return `${meta.category || ""}${meta.parent_filename ? ` — ${meta.parent_filename}` : ""}`;
    return "";
  };

  const typeCounts = {};
  sourceTypes.forEach(t => { typeCounts[t] = sources.filter(s => s.source_type === t).length; });

  const isDocument = (source) => source.source_type === "document";

  // Track which documents are in page-by-page view mode
  const [pageViewId, setPageViewId] = useState(null);

  const getExtractionQualityBadge = (meta) => {
    const quality = meta?.extraction_quality;
    if (!quality || quality === "failed") return null;
    if (quality === "good") {
      return (
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-700/40">
          {isAr ? "استخراج جيد" : "Good extraction"}
        </span>
      );
    }
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-700/40">
        {isAr ? "استخراج جزئي" : "Partial extraction"}
      </span>
    );
  };

  const getDisplayText = (source) => {
    const meta = source.metadata || {};
    return meta.cleaned_text || source.content;
  };

  const renderPageByPageView = (meta) => {
    const pages = meta?.pages_text;
    if (!pages || !Array.isArray(pages) || pages.length === 0) return null;
    return (
      <div className="space-y-0">
        {pages.map((pageText, idx) => (
          <div key={idx}>
            <div className="flex items-center gap-2 py-2">
              <div className="flex-1 h-px bg-gray-700/50" />
              <span className="text-[10px] text-gray-500 font-medium shrink-0">
                {isAr ? `صفحة ${idx + 1}` : `Page ${idx + 1}`}
              </span>
              <div className="flex-1 h-px bg-gray-700/50" />
            </div>
            <div className="whitespace-pre-wrap font-mono text-xs text-gray-300 leading-relaxed px-3 py-2 rounded-lg bg-gray-900/30">
              {pageText.trim() || (isAr ? "(صفحة فارغة)" : "(Empty page)")}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderDocumentCard = (source, cfg, isExpanded, contextLabel) => {
    const meta = source.metadata || {};
    const showFullText = fullTextId === source.id;
    const showPageView = pageViewId === source.id;
    const displayText = getDisplayText(source);
    const contentPreview = displayText && displayText !== "extraction_failed"
      ? displayText.slice(0, 200)
      : null;
    const hasFullText = displayText && displayText !== "extraction_failed" && displayText.length > 200;
    const hasPages = meta.pages_text && Array.isArray(meta.pages_text) && meta.pages_text.length > 1;

    return (
      <div
        key={source.id}
        className="group rounded-xl transition-all hover:scale-[1.005]"
        style={glass(isExpanded ? 0.7 : 0.4)}
      >
        <div className="flex items-start gap-3 p-3.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}>
            {cfg.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: cfg.color }}>
                {isAr ? cfg.labelAr : cfg.label}
              </span>
              <span className="text-gray-700">·</span>
              <span className="text-xs text-gray-300 truncate font-medium">{meta.filename || "Document"}</span>
              {getExtractionQualityBadge(meta)}
              {getConfidenceBadge(source.id)}
              {getVerificationBadge(source)}
            </div>

            <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
              {meta.file_size && <span>{formatFileSize(meta.file_size)}</span>}
              {meta.page_count && <span>{meta.page_count} {isAr ? "صفحة" : (meta.page_count === 1 ? "page" : "pages")}</span>}
              {meta.sheet_count && <span>{meta.sheet_count} {isAr ? "ورقة" : (meta.sheet_count === 1 ? "sheet" : "sheets")}</span>}
              {meta.row_count && <span>{meta.row_count} {isAr ? "صف" : "rows"}</span>}
              <span>{formatDate(source.created_at)}</span>
            </div>

            {contentPreview && !showFullText && !showPageView && (
              <div className="text-sm text-gray-400 mb-1">
                <span>{contentPreview}{displayText.length > 200 ? "..." : ""}</span>
              </div>
            )}

            {showFullText && displayText && displayText !== "extraction_failed" && (
              <div className="mt-2 mb-1 rounded-lg border border-gray-700/50 bg-gray-900/40 overflow-hidden">
                <div className="max-h-96 overflow-y-auto p-3">
                  <pre className="whitespace-pre-wrap font-mono text-xs text-gray-300 leading-relaxed">{displayText}</pre>
                </div>
              </div>
            )}

            {showPageView && (
              <div className="mt-2 mb-1 rounded-lg border border-gray-700/50 bg-gray-900/40 overflow-hidden">
                <div className="max-h-96 overflow-y-auto p-3">
                  {renderPageByPageView(meta)}
                </div>
              </div>
            )}

            {source.content === "extraction_failed" && (
              <div className="text-xs text-amber-500/70 italic">
                {isAr ? "تعذر استخراج النص" : "Text extraction failed"}
              </div>
            )}

            <div className="flex items-center gap-2 mt-1.5">
              {hasFullText && (
                <button
                  onClick={(e) => { e.stopPropagation(); setPageViewId(null); setFullTextId(showFullText ? null : source.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition hover:opacity-80"
                  style={{ borderColor: `${cfg.color}50`, color: cfg.color }}
                >
                  {showFullText ? (isAr ? "طي" : "Collapse") : (isAr ? "عرض النص الكامل" : "View Full Text")}
                </button>
              )}
              {hasPages && (
                <button
                  onClick={(e) => { e.stopPropagation(); setFullTextId(null); setPageViewId(showPageView ? null : source.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition hover:opacity-80"
                  style={{ borderColor: `${cfg.color}50`, color: cfg.color }}
                >
                  {showPageView ? (isAr ? "طي" : "Collapse") : (isAr ? "عرض حسب الصفحة" : "Page by Page")}
                </button>
              )}
              {displayText && displayText !== "extraction_failed" && (
                <button
                  onClick={(e) => handleAnalyze(e, source)}
                  disabled={analyzingId === source.id}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "#818cf850", color: "#818cf8" }}
                >
                  {analyzingId === source.id
                    ? (isAr ? "جاري التحليل..." : "Analyzing...")
                    : meta.ai_analysis
                      ? (isAr ? "إعادة التحليل بالذكاء الاصطناعي" : "Re-analyze with AI")
                      : (isAr ? "تحليل بالذكاء الاصطناعي" : "Analyze with AI")}
                </button>
              )}
              <button
                onClick={(e) => handleDownload(e, source)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-gray-600 text-gray-400 transition hover:text-white hover:border-gray-400"
              >
                {isAr ? "تحميل" : "Download"}
              </button>
              {!(source.metadata || {}).user_verified && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleVerify(source.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-700/50 text-emerald-400 transition hover:bg-emerald-900/20"
                >
                  {isAr ? "توثيق" : "Verify"}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleTraceImpact(source.id); }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-blue-700/50 text-blue-400 transition hover:bg-blue-900/20"
              >
                {isAr ? "تتبع الأثر" : "Impact"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setQuarantineConfirm(source.id); }}
                className="text-[10px] px-2 py-0.5 rounded-full border border-amber-700/50 text-amber-400 transition hover:bg-amber-900/20"
              >
                {isAr ? "حجر" : "Quarantine"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSource(source.id, true); }}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded-full border border-red-900/50 text-red-400/70 transition hover:text-red-400 hover:border-red-500/50"
              >
                {isAr ? "حذف" : "Delete"}
              </button>
            </div>

            {/* Analyzing loading state */}
            {analyzingId === source.id && (
              <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-indigo-900/20 border border-indigo-700/30">
                <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                <span className="text-xs text-indigo-300">{isAr ? "جاري تحليل المستند..." : "Analyzing document..."}</span>
              </div>
            )}

            {/* Show "View Analysis" button if analysis exists but review panel is not open */}
            {meta.ai_analysis && analysisReviewId !== source.id && analyzingId !== source.id && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalysisData(prev => ({ ...prev, [source.id]: meta.ai_analysis }));
                  setAnalysisReviewId(source.id);
                  setRejectedItems({});
                  const cats = Object.keys(meta.ai_analysis.categories || {});
                  const expanded = {};
                  cats.forEach(c => { expanded[c] = true; });
                  setExpandedCategories(expanded);
                }}
                className="mt-2 flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-lg border border-indigo-700/40 text-indigo-400 hover:bg-indigo-900/20 transition"
              >
                <span>🔬</span>
                <span>{isAr ? "عرض نتائج التحليل" : "View Analysis Results"}</span>
                <span className="text-indigo-500">({Object.values(meta.ai_analysis.categories || {}).reduce((s, d) => s + (d.items || []).length, 0)} {isAr ? "عنصر" : "items"})</span>
              </button>
            )}
          </div>
        </div>

        {/* AI Analysis Review Panel */}
        {analysisReviewId === source.id && analysisData[source.id] && (
          <div className="border-t border-gray-700/50 p-3.5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{isAr ? "مراجعة استخراج AI" : "AI Extraction Review"}</span>
                <span className="text-[10px] text-gray-500">
                  {totalExtractionItems(source.id)} {isAr ? "عنصر مستخرج" : "items extracted"}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setAnalysisReviewId(null); }}
                className="text-gray-500 hover:text-gray-300 text-xs px-2 py-0.5"
              >
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(analysisData[source.id].categories || {}).map(([category, data]) => {
                const items = data.items || [];
                if (items.length === 0) return null;
                const isExpCat = expandedCategories[category] !== false;
                return (
                  <div key={category} className="rounded-lg border border-gray-700/40 overflow-hidden">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCategories(prev => ({ ...prev, [category]: !isExpCat }));
                      }}
                      className="w-full flex items-center justify-between p-2.5 text-left hover:bg-gray-800/30 transition"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{isExpCat ? "▾" : "▸"}</span>
                        <span className="text-xs font-medium text-white">{category}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{items.length}</span>
                      </div>
                    </button>
                    {isExpCat && (
                      <div className="border-t border-gray-700/30 divide-y divide-gray-800/40">
                        {items.map((item, idx) => {
                          const key = `${category}::${idx}`;
                          const isRejected = !!rejectedItems[key];
                          const confColor = item.confidence === "high" ? "text-emerald-400 bg-emerald-900/30 border-emerald-700/40"
                            : item.confidence === "low" ? "text-red-400 bg-red-900/30 border-red-700/40"
                            : "text-amber-400 bg-amber-900/30 border-amber-700/40";
                          return (
                            <div key={idx} className={`p-2.5 ${isRejected ? "opacity-40" : ""} transition-opacity`}>
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <div className="text-xs text-gray-300 leading-relaxed">{item.text}</div>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${confColor}`}>
                                      {item.confidence}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleItemRejected(category, idx); }}
                                  className={`shrink-0 text-[10px] px-2 py-1 rounded-md border transition ${
                                    isRejected
                                      ? "border-red-700/50 text-red-400 bg-red-900/20"
                                      : "border-emerald-700/50 text-emerald-400 bg-emerald-900/20"
                                  }`}
                                >
                                  {isRejected ? (isAr ? "مرفوض" : "Rejected") : (isAr ? "مقبول" : "Approved")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700/40">
              <button
                onClick={(e) => { e.stopPropagation(); handleApproveAll(source.id); }}
                disabled={approving || totalExtractionItems(source.id) === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition hover:scale-[1.02] disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)", color: "#fff" }}
              >
                {approving ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? "قبول الكل" : "Approve All")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleApproveSelected(source.id); }}
                disabled={approving || getApprovedItems(source.id).length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-600/50 text-indigo-400 transition hover:bg-indigo-900/20 disabled:opacity-40"
              >
                {isAr ? `قبول المحدد (${getApprovedItems(source.id).length})` : `Approve Selected (${getApprovedItems(source.id).length})`}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setAnalysisReviewId(null); }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition"
              >
                {isAr ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{isAr ? "مصدر الحقيقة" : "Source of Truth"}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{isAr ? "تتبع مصادر بيانات الاستراتيجية" : "Track every input that shaped this strategy"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition hover:scale-[1.02] border"
            style={{ borderColor: `${sourceTypeConfig.document.color}50`, color: sourceTypeConfig.document.color }}
          >
            📄 {isAr ? "رفع مستند" : "Upload Document"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            onChange={handleFileInput}
            className="hidden"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}
          >
            + {isAr ? "إدخال يدوي" : "Manual Entry"}
          </button>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative rounded-xl p-4 text-center cursor-pointer transition-all border-2 border-dashed ${dragOver ? "scale-[1.01]" : "hover:scale-[1.005]"}`}
        style={{
          borderColor: dragOver ? sourceTypeConfig.document.color : `${BORDER}`,
          background: dragOver ? "rgba(244, 114, 182, 0.05)" : "rgba(22, 37, 68, 0.3)",
        }}
      >
        {uploading ? (
          <div className="space-y-2">
            <div className="text-sm text-gray-400">{isAr ? "جاري الرفع..." : "Uploading..."}</div>
            <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%`, background: `linear-gradient(90deg, ${sourceTypeConfig.document.color}, ${GOLD})` }}
              />
            </div>
            <div className="text-[10px] text-gray-500">{uploadProgress}%</div>
          </div>
        ) : (
          <>
            <div className="text-xl mb-1">{dragOver ? "📥" : "📎"}</div>
            <div className="text-xs text-gray-400">
              {dragOver
                ? (isAr ? "أفلت الملف هنا" : "Drop file here")
                : (isAr ? "اسحب وأفلت ملفًا هنا أو انقر للاختيار" : "Drag & drop a file here, or click to browse")}
            </div>
            <div className="text-[10px] text-gray-600 mt-1">
              PDF, DOCX, XLSX, CSV, TXT, PNG, JPG — {isAr ? "الحد الأقصى 10MB" : "Max 10MB"}
            </div>
          </>
        )}
      </div>

      {/* Upload Error */}
      {uploadError && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-900/20 border border-red-800/30 text-red-400 text-xs">
          <span>⚠️</span>
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError("")} className="hover:text-red-300">✕</button>
        </div>
      )}

      {/* Stats — 5 cards */}
      <div className="grid grid-cols-6 gap-2.5">
        {sourceTypes.map(type => {
          const cfg = sourceTypeConfig[type];
          const count = typeCounts[type] || 0;
          const isActive = filter === type;
          return (
            <button
              key={type}
              onClick={() => setFilter(isActive ? null : type)}
              className={`p-3 rounded-xl text-left transition-all ${isActive ? "ring-1 scale-[1.02]" : "hover:scale-[1.01]"}`}
              style={{
                ...glass(isActive ? 0.8 : 0.4),
                borderColor: isActive ? cfg.color : undefined,
                ringColor: isActive ? cfg.color : undefined,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{cfg.icon}</span>
                <span className="text-lg font-bold" style={{ color: cfg.color }}>{count}</span>
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">{isAr ? cfg.labelAr : cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? "ابحث في جميع المصادر..." : "Search across all sources..."}
          className={`${inputCls} pl-9`}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 text-xs">
            ✕
          </button>
        )}
      </div>

      {/* Active filters indicator */}
      {(filter || searchDebounced) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">{isAr ? "تصفية:" : "Filtering:"}</span>
          {filter && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full border" style={{ borderColor: sourceTypeConfig[filter].color, color: sourceTypeConfig[filter].color }}>
              {sourceTypeConfig[filter].icon} {isAr ? sourceTypeConfig[filter].labelAr : sourceTypeConfig[filter].label}
              <button onClick={() => setFilter(null)} className="ml-1 hover:opacity-70">✕</button>
            </span>
          )}
          {searchDebounced && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full border border-gray-600 text-gray-400">
              "{searchDebounced}"
              <button onClick={() => setSearch("")} className="ml-1 hover:opacity-70">✕</button>
            </span>
          )}
          <span className="text-gray-600">({sources.length} {isAr ? "نتيجة" : "results"})</span>
        </div>
      )}

      {/* Sources List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={glass(0.3)}>
          <div className="text-3xl mb-3">{searchDebounced || filter ? "🔍" : "📭"}</div>
          <div className="text-gray-400 text-sm">
            {searchDebounced || filter
              ? (isAr ? "لم يتم العثور على مصادر مطابقة" : "No matching sources found")
              : (isAr ? "لا توجد مصادر بعد. ستتم إضافتها تلقائيًا أثناء عملك." : "No sources yet. They'll be auto-captured as you work.")}
          </div>
          {!searchDebounced && !filter && (
            <div className="text-gray-600 text-xs mt-2">
              {isAr ? "أجوبة الاستبيان، محادثات AI، وملاحظات التنفيذ ستظهر هنا" : "Questionnaire answers, AI chats, and feedback will appear here"}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(source => {
            const cfg = sourceTypeConfig[source.source_type] || sourceTypeConfig.manual_entry;
            const isExpanded = expandedId === source.id;
            const contextLabel = getContextLabel(source);

            if (isDocument(source)) {
              return renderDocumentCard(source, cfg, isExpanded, contextLabel);
            }

            return (
              <div
                key={source.id}
                className="group rounded-xl transition-all cursor-pointer hover:scale-[1.005]"
                style={glass(isExpanded ? 0.7 : 0.4)}
                onClick={() => setExpandedId(isExpanded ? null : source.id)}
              >
                <div className="flex items-start gap-3 p-3.5">
                  {/* Type icon */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-base" style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}>
                    {cfg.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: cfg.color }}>
                        {isAr ? cfg.labelAr : cfg.label}
                      </span>
                      {contextLabel && (
                        <>
                          <span className="text-gray-700">·</span>
                          <span className="text-[10px] text-gray-500 truncate">{contextLabel}</span>
                        </>
                      )}
                    </div>
                    <div className={`text-sm text-gray-300 ${isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>
                      {source.content}
                    </div>
                    {isExpanded && source.metadata && Object.keys(source.metadata).length > 0 && (
                      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">{isAr ? "البيانات الوصفية" : "Metadata"}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(source.metadata).filter(([k]) => !["context"].includes(k)).map(([k, v]) => (
                            <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800/50 text-gray-500 border border-gray-700/50">
                              {k}: {typeof v === "object" ? JSON.stringify(v).slice(0, 50) : String(v).slice(0, 50)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Timestamp + actions */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-600">{formatDate(source.created_at)}</span>
                      {getConfidenceBadge(source.id)}
                      {getVerificationBadge(source)}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      {!(source.metadata || {}).user_verified && (
                        <button onClick={e => { e.stopPropagation(); handleVerify(source.id); }}
                          className="text-[9px] px-1.5 py-0.5 rounded text-emerald-400 hover:bg-emerald-900/20 transition" title={isAr ? "توثيق" : "Verify"}>✓</button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleTraceImpact(source.id); }}
                        className="text-[9px] px-1.5 py-0.5 rounded text-blue-400 hover:bg-blue-900/20 transition" title={isAr ? "تتبع الأثر" : "Trace Impact"}>🔗</button>
                      <button onClick={e => { e.stopPropagation(); setQuarantineConfirm(source.id); }}
                        className="text-[9px] px-1.5 py-0.5 rounded text-amber-400 hover:bg-amber-900/20 transition" title={isAr ? "حجر" : "Quarantine"}>🚫</button>
                      {source.source_type === "manual_entry" && (
                        <button onClick={e => { e.stopPropagation(); deleteSource(source.id, false); }}
                          className="text-gray-600 hover:text-red-400 text-xs transition p-0.5" title={isAr ? "حذف" : "Delete"}>✕</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Data Health Banner */}
      {dataHealth && dataHealth.health_score < 70 && (
        <div className="flex items-center gap-2 p-3 rounded-xl border" style={{ borderColor: "rgba(234, 179, 8, 0.3)", background: "rgba(234, 179, 8, 0.06)" }}>
          <span className="text-base">⚠️</span>
          <span className="text-xs text-amber-400 flex-1">{isAr ? "بيانات استراتيجيتك بها تعارضات غير محلولة قد تؤثر على دقة AI." : "Your strategy data has unresolved conflicts that may affect AI accuracy."}</span>
          <span className="text-[10px] text-amber-500 font-bold">{dataHealth.health_score}%</span>
        </div>
      )}

      {/* Data Health Summary */}
      {dataHealth && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: isAr ? "إجمالي المصادر" : "Total Sources", value: dataHealth.total_sources, color: "#60a5fa" },
            { label: isAr ? "موثقة" : "Verified", value: dataHealth.verified_sources, color: "#34d399" },
            { label: isAr ? "متنازع عليها" : "Disputed", value: dataHealth.disputed_sources, color: "#f87171" },
            { label: isAr ? "محجورة" : "Quarantined", value: dataHealth.quarantined_sources, color: "#9ca3af" },
            { label: isAr ? "صحة البيانات" : "Data Health", value: `${dataHealth.health_score}%`, color: dataHealth.health_score >= 80 ? "#34d399" : dataHealth.health_score >= 60 ? "#fbbf24" : "#f87171" },
          ].map((stat, i) => (
            <div key={i} className="p-2.5 rounded-xl text-center" style={glass(0.4)}>
              <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quarantine Filter Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setShowQuarantine(!showQuarantine); if (!showQuarantine) loadQuarantined(); }}
          className={`text-[10px] px-3 py-1.5 rounded-lg border transition ${showQuarantine ? "border-gray-500 text-white bg-gray-800/50" : "border-gray-700 text-gray-500 hover:text-gray-300"}`}
        >
          🚫 {isAr ? "المحجورة" : "Quarantined"} {quarantinedSources.length > 0 ? `(${quarantinedSources.length})` : ""}
        </button>
      </div>

      {/* Quarantined Sources List */}
      {showQuarantine && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 font-medium">{isAr ? "المصادر المحجورة" : "Quarantined Sources"}</div>
          {quarantinedSources.length === 0 ? (
            <div className="text-center py-6 text-gray-600 text-xs rounded-xl" style={glass(0.3)}>
              {isAr ? "لا توجد مصادر محجورة" : "No quarantined sources"}
            </div>
          ) : quarantinedSources.map(src => {
            const cfg = sourceTypeConfig[src.source_type] || sourceTypeConfig.manual_entry;
            const meta = src.metadata || {};
            return (
              <div key={src.id} className="flex items-center gap-3 p-3 rounded-xl" style={glass(0.3)}>
                <span className="text-base">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate">{src.content?.slice(0, 100)}</div>
                  <div className="text-[10px] text-gray-600 mt-0.5">
                    {meta.quarantine_reason && <span>{isAr ? "السبب:" : "Reason:"} {meta.quarantine_reason} · </span>}
                    {meta.quarantined_at && formatDate(meta.quarantined_at)}
                  </div>
                </div>
                <button onClick={() => handleRestore(src.id)}
                  className="text-[10px] px-2.5 py-1 rounded-lg border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20 transition">
                  {isAr ? "استعادة" : "Restore"}
                </button>
                <button onClick={() => deleteSource(src.id, src.source_type === "document")}
                  className="text-[10px] px-2.5 py-1 rounded-lg border border-red-900/50 text-red-400/70 hover:text-red-400 transition">
                  {isAr ? "حذف نهائي" : "Delete"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Impact Trace Modal */}
      {impactData && impactSourceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setImpactData(null); setImpactSourceId(null); }}>
          <div className="w-full max-w-md mx-4 rounded-2xl p-6" style={{ ...glass(0.9), background: "rgba(10, 22, 40, 0.95)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-base mb-1">🔗 {isAr ? "تتبع الأثر" : "Impact Trace"}</h3>
            <p className="text-gray-500 text-xs mb-4">{isAr ? "أين تم استخدام هذا المصدر" : "Where this source was referenced"}: <span className="text-gray-300">{impactData.source_label}</span></p>
            {impactData.impacts.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">{isAr ? "لم يُستخدم هذا المصدر في أي مخرجات بعد." : "This source has not been referenced in any outputs yet."}</div>
            ) : (
              <div className="space-y-2 mb-4">
                {impactData.impacts.map((imp, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={glass(0.4)}>
                    <span className="text-base">{imp.entity_type === "ai_chat" ? "🤖" : imp.entity_type === "action_plan" ? "📋" : imp.entity_type === "ai_extraction" ? "🔬" : "📊"}</span>
                    <div className="flex-1">
                      <div className="text-xs text-white font-medium">{imp.entity_label}</div>
                      <div className="text-[10px] text-gray-500">{imp.details}</div>
                    </div>
                    <span className="text-xs text-amber-400 font-bold">{imp.usage_count}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: BORDER }}>
              <span className="text-[10px] text-gray-600">{isAr ? "إجمالي المراجع" : "Total references"}: {impactData.total_references}</span>
              <button onClick={() => { setImpactData(null); setImpactSourceId(null); }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quarantine Confirm Modal */}
      {quarantineConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setQuarantineConfirm(null)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl p-6" style={{ ...glass(0.9), background: "rgba(10, 22, 40, 0.95)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-base mb-2">🚫 {isAr ? "حجر المصدر" : "Quarantine Source"}</h3>
            <p className="text-gray-400 text-xs mb-4">{isAr ? "سيتم استبعاد هذا المصدر من سياق جميع الوكلاء فورًا. سيظهر تحذير بجوار أي مخرجات AI استخدمت هذا المصدر." : "This source will be excluded from all agent context immediately. A warning will appear next to any AI output that referenced this source."}</p>
            <input id="quarantine-reason" placeholder={isAr ? "السبب (اختياري)..." : "Reason (optional)..."} className={`${inputCls} mb-4`} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setQuarantineConfirm(null)} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">{isAr ? "إلغاء" : "Cancel"}</button>
              <button
                onClick={() => { const reason = document.getElementById("quarantine-reason")?.value || ""; handleQuarantine(quarantineConfirm, reason); }}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0a1628" }}
              >
                {isAr ? "حجر" : "Quarantine"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="w-full max-w-lg mx-4 rounded-2xl p-6" style={{ ...glass(0.9), background: "rgba(10, 22, 40, 0.95)" }} onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-base mb-1">{isAr ? "إضافة مرجع يدوي" : "Add Manual Reference"}</h3>
            <p className="text-gray-500 text-xs mb-4">{isAr ? 'أضف مرجعًا مثل "بناءً على تقرير ماكنزي Q3 2025"' : 'Add a reference like "Based on McKinsey report Q3 2025"'}</p>
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder={isAr ? "أدخل المرجع أو الملاحظة..." : "Enter your reference or note..."}
              rows={4}
              className={`${inputCls} resize-none mb-4`}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowAddModal(false); setNewContent(""); }} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition">
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button
                onClick={addManualSource}
                disabled={!newContent.trim()}
                className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}
              >
                {isAr ? "إضافة" : "Add Source"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
