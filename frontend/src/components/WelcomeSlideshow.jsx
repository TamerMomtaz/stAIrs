import { useState, useEffect, useCallback } from "react";
import { GOLD, GOLD_L, BORDER } from "../constants";

const BG = "#0a0e1a";
const ACCENT = "#f5b731";
const ACCENT_L = "#ffd666";

// ═══ LOCALSTORAGE KEY ═══
const WELCOME_SEEN_KEY = "stairs_welcome_seen";

export const hasSeenWelcome = (userId) => {
  try { return localStorage.getItem(`${WELCOME_SEEN_KEY}_${userId}`) === "true"; } catch { return false; }
};

export const markWelcomeSeen = (userId) => {
  try { localStorage.setItem(`${WELCOME_SEEN_KEY}_${userId}`, "true"); } catch {}
};

// ═══ ICON COMPONENTS ═══
const FormIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect x="6" y="4" width="28" height="32" rx="3" stroke={ACCENT} strokeWidth="2" />
    <line x1="12" y1="13" x2="28" y2="13" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="19" x2="24" y2="19" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
    <line x1="12" y1="25" x2="20" y2="25" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <circle cx="28" cy="28" r="6" fill={BG} stroke={ACCENT} strokeWidth="1.5" />
    <path d="M26 28l1.5 1.5 3-3" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UploadIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect x="6" y="8" width="28" height="28" rx="3" stroke={ACCENT} strokeWidth="2" />
    <path d="M20 16v12M15 21l5-5 5 5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="12" y="4" width="16" height="4" rx="1" fill={ACCENT} opacity="0.3" />
  </svg>
);

const RobotIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect x="8" y="12" width="24" height="20" rx="4" stroke={ACCENT} strokeWidth="2" />
    <circle cx="16" cy="22" r="2.5" fill={ACCENT} />
    <circle cx="24" cy="22" r="2.5" fill={ACCENT} />
    <path d="M15 28h10" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="6" x2="20" y2="12" stroke={ACCENT} strokeWidth="1.5" />
    <circle cx="20" cy="5" r="2" fill={ACCENT} opacity="0.6" />
    <line x1="4" y1="20" x2="8" y2="20" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    <line x1="32" y1="20" x2="36" y2="20" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RocketIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <path d="M20 4c-4 8-4 16-4 24h8c0-8 0-16-4-24z" stroke={ACCENT} strokeWidth="2" fill="none" />
    <path d="M16 28l-4 6h4" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M24 28l4 6h-4" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="20" cy="18" r="2.5" fill={ACCENT} />
    <path d="M18 34h4" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// ═══ ANIMATED STEP PATH (Slide 2) ═══
const StepPath = ({ animate }) => {
  const steps = [
    { icon: <FormIcon />, label: "Name your strategy &\ntell us about your company", num: 1 },
    { icon: <UploadIcon />, label: "Upload your documents —\npitch deck, business plan,\nresearch (optional)", num: 2 },
    { icon: <RobotIcon />, label: "AI pre-fills your strategy\nquestionnaire from your docs", num: 3 },
    { icon: <RocketIcon />, label: "Review, adjust, and\nlaunch your strategy", num: 4 },
  ];

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: "12px", flexWrap: "wrap", maxWidth: "800px", margin: "0 auto" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "150px",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 300 + 200}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >
            <div style={{
              width: "64px", height: "64px", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center",
              background: `${ACCENT}15`, border: `2px solid ${ACCENT}40`, position: "relative",
            }}>
              {s.icon}
              <span style={{ position: "absolute", top: "-8px", right: "-8px", width: "22px", height: "22px", borderRadius: "50%", background: ACCENT, color: BG, fontSize: "11px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>{s.num}</span>
            </div>
            <span style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", lineHeight: "1.5", whiteSpace: "pre-line" }}>{s.label}</span>
          </div>
          {i < 3 && (
            <div
              className={animate ? "slideshow-fadeUp" : ""}
              style={{
                marginTop: "28px", color: ACCENT, fontSize: "20px", opacity: animate ? 0 : 0.5,
                animationDelay: animate ? `${i * 300 + 350}ms` : undefined,
                animationFillMode: "forwards",
              }}
            >→</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ═══ ANIMATED FILE CARDS (Slide 3) ═══
const FileCards = ({ animate }) => {
  const files = [
    { name: "Pitch Deck.pdf", icon: "📊", color: "#f472b6" },
    { name: "Business Plan.docx", icon: "📄", color: "#60a5fa" },
    { name: "Market Research.xlsx", icon: "📈", color: "#34d399" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", maxWidth: "400px", margin: "0 auto" }}>
      {files.map((f, i) => (
        <div
          key={i}
          className={animate ? "slideshow-fadeUp" : ""}
          style={{
            display: "flex", alignItems: "center", gap: "16px", padding: "16px 24px", borderRadius: "12px",
            background: "rgba(22, 37, 68, 0.7)", border: `1px solid ${BORDER}`, width: "100%",
            opacity: animate ? 0 : 1,
            animationDelay: animate ? `${i * 400 + 300}ms` : undefined,
            animationFillMode: "forwards",
          }}
        >
          <span style={{ fontSize: "28px" }}>{f.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontSize: "14px", fontWeight: "600" }}>{f.name}</div>
            <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>Uploaded successfully</div>
          </div>
          <span
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              fontSize: "12px", color: "#34d399", fontWeight: "600", padding: "4px 10px", borderRadius: "8px",
              background: "rgba(52, 211, 153, 0.1)", border: "1px solid rgba(52, 211, 153, 0.2)",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 400 + 600}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >Extracted ✓</span>
        </div>
      ))}
    </div>
  );
};

// ═══ FRAMEWORK BADGES (Slide 4) ═══
const FrameworkBadges = ({ animate }) => {
  const frameworks = [
    { name: "IFE Matrix", icon: "📊", desc: "Internal Factor Evaluation" },
    { name: "EFE Matrix", icon: "🌐", desc: "External Factor Evaluation" },
    { name: "SPACE Matrix", icon: "📐", desc: "Strategic Position & Action" },
    { name: "BCG Matrix", icon: "⬛", desc: "Growth-Share Analysis" },
    { name: "Porter's Five Forces", icon: "🛡️", desc: "Competitive Analysis" },
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center", maxWidth: "600px", margin: "0 auto" }}>
      {frameworks.map((fw, i) => (
        <div
          key={i}
          className={animate ? "slideshow-fadeUp" : ""}
          style={{
            padding: "16px 20px", borderRadius: "14px", background: "rgba(22, 37, 68, 0.7)", border: `1px solid ${BORDER}`,
            display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "160px",
            opacity: animate ? 0 : 1,
            animationDelay: animate ? `${i * 200 + 200}ms` : undefined,
            animationFillMode: "forwards",
          }}
        >
          <span style={{ fontSize: "28px" }}>{fw.icon}</span>
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: "600", textAlign: "center" }}>{fw.name}</span>
          <span style={{ color: "#64748b", fontSize: "10px", textAlign: "center" }}>{fw.desc}</span>
          <span style={{ fontSize: "10px", color: "#34d399", fontWeight: "600", padding: "3px 8px", borderRadius: "6px", background: "rgba(52, 211, 153, 0.1)", border: "1px solid rgba(52, 211, 153, 0.2)", marginTop: "4px" }}>Auto-populated from your data ✓</span>
        </div>
      ))}
    </div>
  );
};

// ═══ EXECUTION SLIDE (Slide 5) ═══
const ExecutionView = ({ animate }) => {
  const items = [
    { label: "Quarterly Marketing Campaign", status: "In Progress", color: "#60a5fa" },
    { label: "Product Launch Preparation", status: "Planning", color: ACCENT },
    { label: "Market Research Phase 2", status: "Ready", color: "#34d399" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", maxWidth: "440px", margin: "0 auto" }}>
      {items.map((item, i) => (
        <div
          key={i}
          className={animate ? "slideshow-fadeUp" : ""}
          style={{
            display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", borderRadius: "12px",
            background: "rgba(22, 37, 68, 0.7)", border: `1px solid ${BORDER}`, width: "100%",
            opacity: animate ? 0 : 1,
            animationDelay: animate ? `${i * 300 + 200}ms` : undefined,
            animationFillMode: "forwards",
          }}
        >
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
          <span style={{ color: "#fff", fontSize: "13px", fontWeight: "500", flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: "10px", color: item.color, fontWeight: "600", padding: "3px 8px", borderRadius: "6px", background: `${item.color}15`, border: `1px solid ${item.color}30` }}>{item.status}</span>
        </div>
      ))}
      <div
        className={animate ? "slideshow-fadeUp" : ""}
        style={{
          marginTop: "8px", display: "flex", alignItems: "center", gap: "10px", padding: "12px 18px", borderRadius: "12px",
          background: `${ACCENT}10`, border: `1px dashed ${ACCENT}40`,
          opacity: animate ? 0 : 1,
          animationDelay: animate ? "1200ms" : undefined,
          animationFillMode: "forwards",
        }}
      >
        <span style={{ fontSize: "18px" }}>🔄</span>
        <div>
          <div style={{ color: ACCENT, fontSize: "12px", fontWeight: "700" }}>"How far can I take this?"</div>
          <div style={{ color: "#94a3b8", fontSize: "10px", marginTop: "2px" }}>AI feedback loop — your execution, refined</div>
        </div>
        <span style={{ fontSize: "10px", color: "#a78bfa", fontWeight: "600", padding: "3px 8px", borderRadius: "6px", background: "rgba(167, 139, 250, 0.1)", border: "1px solid rgba(167, 139, 250, 0.2)", marginLeft: "auto", whiteSpace: "nowrap" }}>Customized Plan</span>
      </div>
    </div>
  );
};

// ═══ DATA FLOW (Slide 6) ═══
const DataFlow = ({ animate }) => {
  const nodes = [
    { label: "Documents", icon: "📄", desc: "Pitch deck, research, plans" },
    { label: "AI Extraction", icon: "🤖", desc: "Intelligent parsing" },
    { label: "AI Advisor", icon: "💡", desc: "Strategic analysis" },
    { label: "Frameworks", icon: "📐", desc: "IFE, EFE, SPACE, BCG, Porter" },
    { label: "Execution", icon: "🚀", desc: "Action plans & KPIs" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap", maxWidth: "800px", margin: "0 auto" }}>
      {nodes.map((n, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "14px 16px", borderRadius: "14px",
              background: "rgba(22, 37, 68, 0.7)", border: `1px solid ${BORDER}`, width: "120px",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 250 + 200}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >
            <span style={{ fontSize: "24px" }}>{n.icon}</span>
            <span style={{ color: "#fff", fontSize: "12px", fontWeight: "600", textAlign: "center" }}>{n.label}</span>
            <span style={{ color: "#64748b", fontSize: "9px", textAlign: "center" }}>{n.desc}</span>
          </div>
          {i < nodes.length - 1 && (
            <span
              className={animate ? "slideshow-fadeUp" : ""}
              style={{
                color: ACCENT, fontSize: "18px", opacity: animate ? 0 : 0.5,
                animationDelay: animate ? `${i * 250 + 350}ms` : undefined,
                animationFillMode: "forwards",
              }}
            >→</span>
          )}
        </div>
      ))}
    </div>
  );
};

// ═══ SLIDE DEFINITIONS ═══
const slideConfigs = [
  {
    id: "opening",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "40px 20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "200ms", animationFillMode: "forwards" }}
        >
          <span style={{
            fontSize: "56px", fontWeight: "800", fontFamily: "'Instrument Serif', Georgia, serif",
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_L})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>ST.AIRS</span>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "500ms", animationFillMode: "forwards", textAlign: "center" }}
        >
          <p style={{ color: "#94a3b8", fontSize: "18px", lineHeight: "1.7", maxWidth: "500px", fontStyle: "italic" }}>
            Most strategy tools stop at the recommendation.<br />
            <span style={{ color: ACCENT, fontWeight: "700", fontStyle: "normal" }}>We begin there.</span>
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "journey",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: "#fff", fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Your Journey</h2>
          <p style={{ color: "#64748b", fontSize: "13px" }}>Four simple steps from idea to execution</p>
        </div>
        <StepPath animate={animate} />
      </div>
    ),
  },
  {
    id: "upload",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: "#fff", fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Upload Your Documents</h2>
          <p style={{ color: "#64748b", fontSize: "13px" }}>We extract insights automatically from your existing work</p>
        </div>
        <FileCards animate={animate} />
      </div>
    ),
  },
  {
    id: "frameworks",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: "#fff", fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Strategic Frameworks</h2>
          <p style={{ color: "#64748b", fontSize: "13px" }}>Five powerful matrix tools, auto-populated from your data</p>
        </div>
        <FrameworkBadges animate={animate} />
      </div>
    ),
  },
  {
    id: "execution",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: "#fff", fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Execution & Feedback</h2>
          <p style={{ color: "#64748b", fontSize: "13px" }}>Action items with AI-powered feedback loops and customized plans</p>
        </div>
        <ExecutionView animate={animate} />
      </div>
    ),
  },
  {
    id: "source-of-truth",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: "#fff", fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Source of Truth</h2>
          <p style={{ color: "#64748b", fontSize: "13px" }}>Every insight tracked from document to execution</p>
        </div>
        <DataFlow animate={animate} />
      </div>
    ),
  },
  {
    id: "closing",
    render: (animate, onGetStarted) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "40px 20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "200ms", animationFillMode: "forwards" }}
        >
          <span style={{
            fontSize: "48px", fontWeight: "800", fontFamily: "'Instrument Serif', Georgia, serif",
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_L})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>ST.AIRS</span>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "500ms", animationFillMode: "forwards" }}
        >
          <p style={{ color: "#94a3b8", fontSize: "16px", lineHeight: "1.7", maxWidth: "450px" }}>
            Where strategy meets execution.<br />
            <span style={{ color: ACCENT, fontWeight: "700", fontSize: "18px" }}>Human IS the Loop.</span>
          </p>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "800ms", animationFillMode: "forwards", marginTop: "12px" }}
        >
          <button
            onClick={onGetStarted}
            data-testid="slideshow-get-started"
            style={{
              padding: "16px 40px", borderRadius: "14px", border: "none", cursor: "pointer",
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_L})`, color: BG,
              fontSize: "16px", fontWeight: "700", letterSpacing: "0.5px",
              boxShadow: `0 0 30px ${ACCENT}40, 0 4px 20px rgba(0,0,0,0.3)`,
              transition: "all 0.3s ease",
            }}
            onMouseEnter={e => { e.target.style.transform = "translateY(-2px) scale(1.02)"; e.target.style.boxShadow = `0 0 40px ${ACCENT}60, 0 8px 30px rgba(0,0,0,0.4)`; }}
            onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = `0 0 30px ${ACCENT}40, 0 4px 20px rgba(0,0,0,0.3)`; }}
          >
            Get Started — Create Your First Strategy →
          </button>
        </div>
      </div>
    ),
  },
];

// ═══ CSS KEYFRAMES (injected once) ═══
const STYLE_ID = "slideshow-animations";
const ensureStyles = () => {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes slideshowFadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .slideshow-fadeUp {
      animation: slideshowFadeUp 0.6s ease forwards;
    }
  `;
  document.head.appendChild(style);
};

// ═══ MAIN COMPONENT ═══
export const WelcomeSlideshow = ({ open, onClose, onGetStarted }) => {
  const [current, setCurrent] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const total = slideConfigs.length;

  useEffect(() => { ensureStyles(); }, []);

  useEffect(() => {
    if (open) { setCurrent(0); setAnimKey(k => k + 1); }
  }, [open]);

  const goTo = useCallback((idx) => {
    if (idx >= 0 && idx < total) { setCurrent(idx); setAnimKey(k => k + 1); }
  }, [total]);

  const next = useCallback(() => goTo(current + 1), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1), [current, goTo]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prev(); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }, [next, prev, onClose]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  const handleGetStarted = useCallback(() => {
    onClose();
    if (onGetStarted) onGetStarted();
  }, [onClose, onGetStarted]);

  if (!open) return null;

  const progress = ((current + 1) / total) * 100;
  const isLast = current === total - 1;
  const isFirst = current === 0;
  const slide = slideConfigs[current];

  return (
    <div
      data-testid="welcome-slideshow"
      role="dialog"
      aria-label="Welcome slideshow"
      style={{
        position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column",
        background: BG,
      }}
    >
      {/* Progress bar */}
      <div style={{ height: "3px", background: "rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div
          data-testid="slideshow-progress"
          style={{
            height: "100%", background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_L})`,
            width: `${progress}%`, transition: "width 0.4s ease",
            boxShadow: `0 0 8px ${ACCENT}60`,
          }}
        />
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        data-testid="slideshow-close"
        style={{
          position: "absolute", top: "16px", right: "16px", zIndex: 10,
          background: "none", border: "none", color: "#64748b", fontSize: "20px",
          cursor: "pointer", padding: "8px", borderRadius: "8px",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.target.style.color = "#fff"; e.target.style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={e => { e.target.style.color = "#64748b"; e.target.style.background = "none"; }}
        aria-label="Close slideshow"
      >✕</button>

      {/* Slide content */}
      <div key={animKey} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: "20px" }}>
        {slide.render(true, handleGetStarted)}
      </div>

      {/* Controls */}
      <div style={{ flexShrink: 0, padding: "16px 24px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Prev */}
        <button
          onClick={prev}
          disabled={isFirst}
          data-testid="slideshow-prev"
          style={{
            padding: "10px 20px", borderRadius: "10px", border: `1px solid ${BORDER}`,
            background: "rgba(22, 37, 68, 0.6)", color: isFirst ? "#334155" : "#94a3b8",
            fontSize: "13px", fontWeight: "600", cursor: isFirst ? "default" : "pointer",
            transition: "all 0.2s", opacity: isFirst ? 0.4 : 1,
            minWidth: "90px",
          }}
        >← Prev</button>

        {/* Dot navigation */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {slideConfigs.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              data-testid={`slideshow-dot-${i}`}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: i === current ? "24px" : "8px", height: "8px", borderRadius: "4px",
                background: i === current ? ACCENT : "rgba(255,255,255,0.15)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Next */}
        {isLast ? (
          <button
            onClick={handleGetStarted}
            data-testid="slideshow-next"
            style={{
              padding: "10px 20px", borderRadius: "10px", border: "none",
              background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_L})`, color: BG,
              fontSize: "13px", fontWeight: "700", cursor: "pointer",
              transition: "all 0.2s", minWidth: "90px",
              boxShadow: `0 0 20px ${ACCENT}30`,
            }}
          >Get Started →</button>
        ) : (
          <button
            onClick={next}
            data-testid="slideshow-next"
            style={{
              padding: "10px 20px", borderRadius: "10px", border: `1px solid ${ACCENT}40`,
              background: `${ACCENT}15`, color: ACCENT,
              fontSize: "13px", fontWeight: "600", cursor: "pointer",
              transition: "all 0.2s", minWidth: "90px",
            }}
          >Next →</button>
        )}
      </div>
    </div>
  );
};

export default WelcomeSlideshow;
