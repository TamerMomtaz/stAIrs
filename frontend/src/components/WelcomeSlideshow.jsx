import { useState, useEffect, useCallback } from "react";
import { ACCENT_BRIGHT, ACCENT_BRIGHT_HI, BAD, BORDER, BORDER_STRONG, DEEPEST, FONT_DISPLAY, GRAD_ACCENT_BRIGHT, GRAD_ACCENT_BRIGHT_90, HUE, INFO, INK, INK_3, INK_GHOST, INK_MUTED, OK, WARN, cast, tint } from "../constants";
const BG = DEEPEST;
const ACCENT = ACCENT_BRIGHT;
const ACCENT_L = ACCENT_BRIGHT_HI;
const LOGO_SRC = "/devoneers-logo.png";

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
              background: `${tint(ACCENT, 8)}`, border: `2px solid ${tint(ACCENT, 25)}`, position: "relative",
            }}>
              {s.icon}
              <span style={{ position: "absolute", top: "-8px", right: "-8px", width: "22px", height: "22px", borderRadius: "50%", background: ACCENT, color: BG, fontSize: "11px", fontWeight: "800", display: "flex", alignItems: "center", justifyContent: "center" }}>{s.num}</span>
            </div>
            <span style={{ fontSize: "12px", color: INK_3, textAlign: "center", lineHeight: "1.5", whiteSpace: "pre-line" }}>{s.label}</span>
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
    { name: "Pitch Deck.pdf", icon: "📊", color: HUE.pink },
    { name: "Business Plan.docx", icon: "📄", color: INFO },
    { name: "Market Research.xlsx", icon: "📈", color: OK },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px", margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
        {files.map((f, i) => (
          <div
            key={i}
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px", borderRadius: "12px",
              background: "rgb(var(--surface-raised-rgb) / 0.7)`, border: `1px solid ${BORDER}`, width: `100%",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 300 + 200}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >
            <span style={{ fontSize: "24px" }}>{f.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: INK, fontSize: "13px", fontWeight: "600" }}>{f.name}</div>
              <div style={{ color: INK_MUTED, fontSize: "10px", marginTop: "2px" }}>Uploaded successfully</div>
            </div>
            <span
              className={animate ? "slideshow-fadeUp" : ""}
              style={{
                fontSize: "11px", color: OK, fontWeight: "600", padding: "3px 8px", borderRadius: "8px",
                background: tint(OK, 10), border: `1px solid ${tint(OK, 20)}`,
                opacity: animate ? 0 : 1,
                animationDelay: animate ? `${i * 300 + 400}ms` : undefined,
                animationFillMode: "forwards",
              }}
            >Extracted ✓</span>
          </div>
        ))}
      </div>
      <div
        className={animate ? "slideshow-fadeUp" : ""}
        style={{
          display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderRadius: "10px",
          background: `${tint(ACCENT, 3)}`, border: `1px dashed ${tint(ACCENT, 19)}`,
          opacity: animate ? 0 : 1,
          animationDelay: animate ? "1200ms" : undefined,
          animationFillMode: "forwards",
        }}
      >
        <span style={{ fontSize: "16px" }}>🔍</span>
        <div>
          <div style={{ color: ACCENT, fontSize: "11px", fontWeight: "700" }}>Source of Truth</div>
          <div style={{ color: INK_3, fontSize: "10px" }}>AI extraction feeds verified sources into everything</div>
        </div>
      </div>
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", maxWidth: "600px", margin: "0 auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "center" }}>
        {frameworks.map((fw, i) => (
          <div
            key={i}
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              padding: "16px 20px", borderRadius: "14px", background: "rgb(var(--surface-raised-rgb) / 0.7)", border: `1px solid ${BORDER}`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "160px",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 200 + 200}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >
            <span style={{ fontSize: "28px" }}>{fw.icon}</span>
            <span style={{ color: INK, fontSize: "13px", fontWeight: "600", textAlign: "center" }}>{fw.name}</span>
            <span style={{ color: INK_MUTED, fontSize: "10px", textAlign: "center" }}>{fw.desc}</span>
            <span style={{ fontSize: "10px", color: OK, fontWeight: "600", padding: "3px 8px", borderRadius: "6px", background: tint(OK, 10), border: `1px solid ${tint(OK, 20)}`, marginTop: "4px" }}>Auto-populated from your data ✓</span>
          </div>
        ))}
      </div>
      <div
        className={animate ? "slideshow-fadeUp" : ""}
        style={{
          display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap",
          opacity: animate ? 0 : 1,
          animationDelay: animate ? "1400ms" : undefined,
          animationFillMode: "forwards",
        }}
      >
        {["Analyze", "Compare", "Export", "AI Insights"].map((chip, i) => (
          <span key={i} style={{ fontSize: "10px", color: ACCENT, fontWeight: "600", padding: "4px 12px", borderRadius: "8px", background: `${tint(ACCENT, 7)}`, border: `1px solid ${tint(ACCENT, 19)}` }}>{chip}</span>
        ))}
      </div>
    </div>
  );
};

// ═══ EXECUTION FLOW (Slide 5) ═══
const ExecutionFlow = ({ animate }) => {
  const steps = [
    { label: "Action", icon: "⚡", desc: "Select any action item", color: INFO },
    { label: "Explain", icon: "💡", desc: "AI explains strategic context", color: HUE.violet },
    { label: "Assess Ability", icon: "📏", desc: "Evaluate what's achievable", color: HUE.teal },
    { label: "Customized Plan", icon: "✨", desc: "Tailored to your capacity", color: ACCENT },
    { label: "Implementation Room", icon: "🚀", desc: "Step-by-step execution", color: OK },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap", maxWidth: "800px", margin: "0 auto" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div
            className={animate ? "slideshow-fadeUp" : ""}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "12px 14px", borderRadius: "14px",
              background: "rgb(var(--surface-raised-rgb) / 0.7)`, border: `1px solid ${BORDER}`, width: `120px",
              opacity: animate ? 0 : 1,
              animationDelay: animate ? `${i * 250 + 200}ms` : undefined,
              animationFillMode: "forwards",
            }}
          >
            <span style={{ fontSize: "22px" }}>{s.icon}</span>
            <span style={{ color: s.color, fontSize: "11px", fontWeight: "700", textAlign: "center" }}>{s.label}</span>
            <span style={{ color: INK_MUTED, fontSize: "9px", textAlign: "center" }}>{s.desc}</span>
          </div>
          {i < steps.length - 1 && (
            <span
              className={animate ? "slideshow-fadeUp" : ""}
              style={{
                color: ACCENT, fontSize: "16px", opacity: animate ? 0 : 0.4,
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

// ═══ MANIFEST ROOM (Slide 6) ═══
const ManifestPreview = ({ animate }) => {
  const items = [
    { title: "Quarterly Marketing Campaign", sections: 4, steps: "8/12", pct: 67 },
    { title: "Product Launch Preparation", sections: 3, steps: "3/9", pct: 33 },
    { title: "Market Research Phase 2", sections: 4, steps: "10/10", pct: 100 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "440px", margin: "0 auto" }}>
      {items.map((item, i) => (
        <div
          key={i}
          className={animate ? "slideshow-fadeUp" : ""}
          style={{
            display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderRadius: "12px",
            background: "rgb(var(--surface-raised-rgb) / 0.7)", border: `1px solid ${BORDER}`, borderLeft: `3px solid ${tint(ACCENT, 38)}`,
            opacity: animate ? 0 : 1,
            animationDelay: animate ? `${i * 300 + 200}ms` : undefined,
            animationFillMode: "forwards",
          }}
        >
          <span style={{ fontSize: "18px" }}>📦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: INK, fontSize: "12px", fontWeight: "600", marginBottom: "4px" }}>{item.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: INK_3 }}>{item.sections}/4 sections</span>
              <span style={{ fontSize: "10px", color: HUE.violet }}>{item.steps} steps</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", shrinkFlex: 0 }}>
            <div style={{ width: "40px", height: "4px", borderRadius: "2px", background: BORDER_STRONG, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "2px", background: item.pct === 100 ? OK : GRAD_ACCENT_BRIGHT_90, width: `${item.pct}%` }} />
            </div>
            <span style={{ fontSize: "10px", color: item.pct === 100 ? OK : ACCENT, fontWeight: "600" }}>{item.pct}%</span>
          </div>
        </div>
      ))}
      <div
        className={animate ? "slideshow-fadeUp" : ""}
        style={{
          display: "flex", gap: "8px", justifyContent: "center",
          opacity: animate ? 0 : 1,
          animationDelay: animate ? "1200ms" : undefined,
          animationFillMode: "forwards",
        }}
      >
        {["Export All PDF", "Track Progress", "Source References"].map((chip, i) => (
          <span key={i} style={{ fontSize: "10px", color: ACCENT, fontWeight: "600", padding: "4px 10px", borderRadius: "8px", background: `${tint(ACCENT, 7)}`, border: `1px solid ${tint(ACCENT, 19)}` }}>{chip}</span>
        ))}
      </div>
    </div>
  );
};

// ═══ DATA INTEGRITY FLOW (Slide 7) ═══
const DataIntegrityFlow = ({ animate }) => {
  const protections = [
    { icon: "🛡️", label: "Quality Gate", desc: "Every upload is checked for relevance before it enters your strategy", color: OK },
    { icon: "⚖️", label: "Contradiction Detection", desc: "Conflicts between sources are flagged for your review", color: INFO },
    { icon: "🔍", label: "Confidence Scoring", desc: "Every data point is scored for reliability — agents weight their advice accordingly", color: HUE.violet },
    { icon: "🔒", label: "Quarantine & Impact Tracing", desc: "Remove bad data instantly and see exactly what it affected", color: HUE.pink },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", maxWidth: "540px", margin: "0 auto" }}>
      {protections.map((p, i) => (
        <div
          key={i}
          className={animate ? "slideshow-fadeUp" : ""}
          style={{
            display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px", borderRadius: "14px",
            background: "rgb(var(--surface-raised-rgb) / 0.7)`, border: `1px solid ${BORDER}`, width: `100%",
            borderLeft: `3px solid ${p.color}`,
            opacity: animate ? 0 : 1,
            animationDelay: animate ? `${i * 300 + 200}ms` : undefined,
            animationFillMode: "forwards",
          }}
        >
          <span style={{ fontSize: "28px", flexShrink: 0 }}>{p.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: p.color, fontSize: "13px", fontWeight: "700", marginBottom: "2px" }}>{p.label}</div>
            <div style={{ color: INK_3, fontSize: "11px", lineHeight: "1.5" }}>{p.desc}</div>
          </div>
        </div>
      ))}
      <div
        className={animate ? "slideshow-fadeUp" : ""}
        style={{
          display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderRadius: "10px",
          background: `${tint(ACCENT, 3)}`, border: `1px dashed ${tint(ACCENT, 19)}`, marginTop: "4px",
          opacity: animate ? 0 : 1,
          animationDelay: animate ? "1500ms" : undefined,
          animationFillMode: "forwards",
        }}
      >
        <span style={{ fontSize: "16px" }}>✅</span>
        <div style={{ color: ACCENT, fontSize: "11px", fontWeight: "700", lineHeight: "1.5" }}>
          Six layers of protection. Because your strategy is only as good as your data.
        </div>
      </div>
    </div>
  );
};

// ═══ ALERTS & KNOWLEDGE (Slide 8) ═══
const AlertsKnowledge = ({ animate }) => (
  <div style={{ display: "flex", gap: "20px", maxWidth: "600px", margin: "0 auto", flexWrap: "wrap", justifyContent: "center" }}>
    <div
      className={animate ? "slideshow-fadeUp" : ""}
      style={{
        flex: "1 1 260px", padding: "18px", borderRadius: "14px", background: "rgb(var(--surface-raised-rgb) / 0.7)", border: `1px solid ${BORDER}`,
        opacity: animate ? 0 : 1,
        animationDelay: animate ? "200ms" : undefined,
        animationFillMode: "forwards",
      }}
    >
      <div style={{ fontSize: "24px", marginBottom: "10px" }}>🔔</div>
      <div style={{ color: INK, fontSize: "14px", fontWeight: "700", marginBottom: "6px" }}>Strategy Alerts</div>
      <div style={{ color: INK_3, fontSize: "11px", lineHeight: "1.6", marginBottom: "10px" }}>Real-time health monitoring across your entire staircase. Get notified when elements go off-track.</div>
      <div style={{ display: "flex", gap: "6px" }}>
        {[{ label: "Critical", color: BAD }, { label: "At Risk", color: WARN }, { label: "Info", color: INFO }].map((a, i) => (
          <span key={i} style={{ fontSize: "9px", color: a.color, padding: "2px 8px", borderRadius: "6px", background: `${tint(a.color, 8)}`, border: `1px solid ${tint(a.color, 19)}`, fontWeight: "600" }}>{a.label}</span>
        ))}
      </div>
    </div>
    <div
      className={animate ? "slideshow-fadeUp" : ""}
      style={{
        flex: "1 1 260px", padding: "18px", borderRadius: "14px", background: "rgb(var(--surface-raised-rgb) / 0.7)", border: `1px solid ${BORDER}`,
        opacity: animate ? 0 : 1,
        animationDelay: animate ? "500ms" : undefined,
        animationFillMode: "forwards",
      }}
    >
      <div style={{ fontSize: "24px", marginBottom: "10px" }}>📖</div>
      <div style={{ color: INK, fontSize: "14px", fontWeight: "700", marginBottom: "6px" }}>Knowledge Library</div>
      <div style={{ color: INK_3, fontSize: "11px", lineHeight: "1.6", marginBottom: "10px" }}>Curated frameworks, books, failure patterns, and measurement tools to inform your strategy.</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {["Frameworks", "Books", "Patterns", "Tools"].map((k, i) => (
          <span key={i} style={{ fontSize: "9px", color: ACCENT, padding: "2px 8px", borderRadius: "6px", background: `${tint(ACCENT, 7)}`, border: `1px solid ${tint(ACCENT, 19)}`, fontWeight: "600" }}>{k}</span>
        ))}
      </div>
    </div>
  </div>
);

// ═══ SLIDE DEFINITIONS ═══
const slideConfigs = [
  {
    id: "opening",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "24px", padding: "40px 20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <img src={LOGO_SRC} alt="DEVONEERS" style={{ width: "200px", marginBottom: "8px" }} />
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "300ms", animationFillMode: "forwards" }}
        >
          <span style={{
            fontSize: "56px", fontWeight: 400, fontFamily: FONT_DISPLAY,
            background: GRAD_ACCENT_BRIGHT,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Stairs</span>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "600ms", animationFillMode: "forwards", textAlign: "center" }}
        >
          <p style={{ color: INK_3, fontSize: "18px", lineHeight: "1.7", maxWidth: "500px", fontStyle: "italic" }}>
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
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Your Journey</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Four simple steps from idea to execution</p>
        </div>
        <StepPath animate={animate} />
      </div>
    ),
  },
  {
    id: "upload",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Upload & Source of Truth</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Upload documents, AI extracts insights, verified sources feed everything</p>
        </div>
        <FileCards animate={animate} />
      </div>
    ),
  },
  {
    id: "frameworks",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Strategic Frameworks</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Five powerful matrix tools with quick-action chips, auto-populated from AI</p>
        </div>
        <FrameworkBadges animate={animate} />
      </div>
    ),
  },
  {
    id: "execution",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Execution & Implementation</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>From action to implementation — a complete execution pipeline</p>
        </div>
        <ExecutionFlow animate={animate} />
      </div>
    ),
  },
  {
    id: "manifest",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Manifest Room</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Organized, exportable view of all your implementation threads</p>
        </div>
        <ManifestPreview animate={animate} />
      </div>
    ),
  },
  {
    id: "data-integrity",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Your data. Verified. Validated. Trusted.</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Four key protections that keep your strategy built on reliable data</p>
        </div>
        <DataIntegrityFlow animate={animate} />
      </div>
    ),
  },
  {
    id: "alerts-knowledge",
    render: (animate) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", padding: "20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <h2 style={{ color: INK, fontSize: "24px", fontWeight: "700", marginBottom: "8px" }}>Alerts & Knowledge</h2>
          <p style={{ color: INK_MUTED, fontSize: "13px" }}>Strategy health monitoring and curated learning resources</p>
        </div>
        <AlertsKnowledge animate={animate} />
      </div>
    ),
  },
  {
    id: "closing",
    render: (animate, onGetStarted, onSkip, hasStrategies) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "40px 20px" }}>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "100ms", animationFillMode: "forwards" }}
        >
          <img src={LOGO_SRC} alt="DEVONEERS" style={{ height: "44px" }} />
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "300ms", animationFillMode: "forwards" }}
        >
          <span style={{
            fontSize: "48px", fontWeight: 400, fontFamily: FONT_DISPLAY,
            background: GRAD_ACCENT_BRIGHT,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Stairs</span>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ textAlign: "center", opacity: animate ? 0 : 1, animationDelay: "500ms", animationFillMode: "forwards" }}
        >
          <p style={{ color: INK_3, fontSize: "16px", lineHeight: "1.7", maxWidth: "450px" }}>
            Where strategy meets execution.<br />
            <span style={{ color: ACCENT, fontWeight: "700", fontSize: "18px" }}>Human IS the Loop.</span>
          </p>
          <p style={{ color: INK_MUTED, fontSize: "13px", marginTop: "8px", letterSpacing: "1px" }}>BY DEVONEERS</p>
        </div>
        <div
          className={animate ? "slideshow-fadeUp" : ""}
          style={{ opacity: animate ? 0 : 1, animationDelay: "800ms", animationFillMode: "forwards", marginTop: "12px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
        >
          {!hasStrategies && (
            <button
              onClick={onGetStarted}
              data-testid="slideshow-get-started"
              style={{
                padding: "16px 40px", borderRadius: "14px", border: "none", cursor: "pointer",
                background: GRAD_ACCENT_BRIGHT, color: BG,
                fontSize: "16px", fontWeight: "700", letterSpacing: "0.5px",
                boxShadow: `0 0 30px ${tint(ACCENT, 25)}, 0 4px 20px ${cast(0.3)}`,
                transition: "all 0.3s ease",
              }}
              onMouseEnter={e => { e.target.style.transform = "translateY(-2px) scale(1.02)"; e.target.style.boxShadow = `0 0 40px ${tint(ACCENT, 38)}, 0 8px 30px ${cast(0.4)}`; }}
              onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = `0 0 30px ${tint(ACCENT, 25)}, 0 4px 20px ${cast(0.3)}`; }}
            >
              Get Started — Create Your First Strategy →
            </button>
          )}
          {hasStrategies && (
            <button
              onClick={onSkip}
              data-testid="slideshow-skip-dashboard"
              style={{
                padding: "16px 40px", borderRadius: "14px", border: "none", cursor: "pointer",
                background: GRAD_ACCENT_BRIGHT, color: BG,
                fontSize: "16px", fontWeight: "700", letterSpacing: "0.5px",
                boxShadow: `0 0 30px ${tint(ACCENT, 25)}, 0 4px 20px ${cast(0.3)}`,
                transition: "all 0.3s ease",
              }}
              onMouseEnter={e => { e.target.style.transform = "translateY(-2px) scale(1.02)"; e.target.style.boxShadow = `0 0 40px ${tint(ACCENT, 38)}, 0 8px 30px ${cast(0.4)}`; }}
              onMouseLeave={e => { e.target.style.transform = ""; e.target.style.boxShadow = `0 0 30px ${tint(ACCENT, 25)}, 0 4px 20px ${cast(0.3)}`; }}
            >
              Skip to Dashboard →
            </button>
          )}
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
export const WelcomeSlideshow = ({ open, onClose, onGetStarted, hasStrategies }) => {
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

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

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
      <div style={{ height: "3px", background: "rgb(var(--surface-hover-rgb) / 0.05)", flexShrink: 0 }}>
        <div
          data-testid="slideshow-progress"
          style={{
            height: "100%", background: GRAD_ACCENT_BRIGHT_90,
            width: `${progress}%`, transition: "width 0.4s ease",
            boxShadow: `0 0 8px ${tint(ACCENT, 38)}`,
          }}
        />
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        data-testid="slideshow-close"
        style={{
          position: "absolute", top: "16px", right: "16px", zIndex: 10,
          background: "none", border: "none", color: INK_MUTED, fontSize: "20px",
          cursor: "pointer", padding: "8px", borderRadius: "8px",
          transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.target.style.color = INK; e.target.style.background = "rgb(var(--surface-hover-rgb) / 0.05)"; }}
        onMouseLeave={e => { e.target.style.color = INK_MUTED; e.target.style.background = "none"; }}
        aria-label="Close slideshow"
      >✕</button>

      {/* Skip to Dashboard — persistent button for returning users on non-last slides */}
      {hasStrategies && !isLast && (
        <button
          onClick={handleSkip}
          data-testid="slideshow-skip"
          style={{
            position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 10,
            background: "none", border: `1px solid ${tint(ACCENT, 25)}`, color: ACCENT,
            fontSize: "12px", fontWeight: "600", cursor: "pointer",
            padding: "6px 16px", borderRadius: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.target.style.background = `${tint(ACCENT, 8)}`; }}
          onMouseLeave={e => { e.target.style.background = "none"; }}
        >Skip to Dashboard →</button>
      )}

      {/* Slide content */}
      <div key={animKey} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", padding: "20px" }}>
        {slide.render(true, handleGetStarted, handleSkip, hasStrategies)}
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
            background: "rgb(var(--surface-raised-rgb) / 0.6)", color: isFirst ? INK_GHOST : INK_3,
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
                background: i === current ? ACCENT : "rgb(var(--surface-hover-rgb) / 0.15)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>

        {/* Next */}
        {isLast ? (
          <button
            onClick={hasStrategies ? handleSkip : handleGetStarted}
            data-testid="slideshow-next"
            style={{
              padding: "10px 20px", borderRadius: "10px", border: "none",
              background: GRAD_ACCENT_BRIGHT, color: BG,
              fontSize: "13px", fontWeight: "700", cursor: "pointer",
              transition: "all 0.2s", minWidth: "90px",
              boxShadow: `0 0 20px ${tint(ACCENT, 19)}`,
            }}
          >{hasStrategies ? "Skip to Dashboard →" : "Get Started →"}</button>
        ) : (
          <button
            onClick={next}
            data-testid="slideshow-next"
            style={{
              padding: "10px 20px", borderRadius: "10px", border: `1px solid ${tint(ACCENT, 25)}`,
              background: `${tint(ACCENT, 8)}`, color: ACCENT,
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
