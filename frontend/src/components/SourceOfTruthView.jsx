import { useState, useEffect, useRef, useCallback } from "react";
import { SourcesAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, inputCls } from "../constants";

const sourceTypeConfig = {
  questionnaire: { icon: "📋", label: "Questionnaire", labelAr: "استبيان", color: "#60a5fa" },
  ai_chat: { icon: "🤖", label: "AI Chat", labelAr: "محادثة AI", color: "#a78bfa" },
  feedback: { icon: "💬", label: "Feedback", labelAr: "ملاحظات", color: "#34d399" },
  manual_entry: { icon: "📝", label: "Manual Entry", labelAr: "إدخال يدوي", color: "#fbbf24" },
  document: { icon: "📄", label: "Documents", labelAr: "مستندات", color: "#f472b6" },
};

const sourceTypes = ["questionnaire", "ai_chat", "feedback", "manual_entry", "document"];

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
    return "";
  };

  const typeCounts = {};
  sourceTypes.forEach(t => { typeCounts[t] = sources.filter(s => s.source_type === t).length; });

  const isDocument = (source) => source.source_type === "document";

  const renderDocumentCard = (source, cfg, isExpanded, contextLabel) => {
    const meta = source.metadata || {};
    const showFullText = fullTextId === source.id;
    const contentPreview = source.content && source.content !== "extraction_failed"
      ? source.content.slice(0, 200)
      : null;
    const hasFullText = source.content && source.content !== "extraction_failed" && source.content.length > 200;

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
            </div>

            <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
              {meta.file_size && <span>{formatFileSize(meta.file_size)}</span>}
              {meta.page_count && <span>{meta.page_count} {isAr ? "صفحة" : (meta.page_count === 1 ? "page" : "pages")}</span>}
              {meta.sheet_count && <span>{meta.sheet_count} {isAr ? "ورقة" : (meta.sheet_count === 1 ? "sheet" : "sheets")}</span>}
              {meta.row_count && <span>{meta.row_count} {isAr ? "صف" : "rows"}</span>}
              <span>{formatDate(source.created_at)}</span>
            </div>

            {contentPreview && (
              <div className="text-sm text-gray-400 mb-1">
                {showFullText ? (
                  <div className="whitespace-pre-wrap text-gray-300">{source.content}</div>
                ) : (
                  <span>{contentPreview}{source.content.length > 200 ? "..." : ""}</span>
                )}
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
                  onClick={(e) => { e.stopPropagation(); setFullTextId(showFullText ? null : source.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full border transition hover:opacity-80"
                  style={{ borderColor: `${cfg.color}50`, color: cfg.color }}
                >
                  {showFullText ? (isAr ? "طي" : "Collapse") : (isAr ? "عرض النص الكامل" : "View Full Text")}
                </button>
              )}
              <button
                onClick={(e) => handleDownload(e, source)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-gray-600 text-gray-400 transition hover:text-white hover:border-gray-400"
              >
                {isAr ? "تحميل" : "Download"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSource(source.id, true); }}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-2 py-0.5 rounded-full border border-red-900/50 text-red-400/70 transition hover:text-red-400 hover:border-red-500/50"
              >
                {isAr ? "حذف" : "Delete"}
              </button>
            </div>
          </div>
        </div>
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
      <div className="grid grid-cols-5 gap-2.5">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-600">{formatDate(source.created_at)}</span>
                    {source.source_type === "manual_entry" && (
                      <button
                        onClick={e => { e.stopPropagation(); deleteSource(source.id, false); }}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition p-1"
                        title={isAr ? "حذف" : "Delete"}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
