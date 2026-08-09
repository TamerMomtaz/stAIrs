import { useState, useEffect } from "react";
import { BORDER, DEEP, DEEP_MID, FONT_DISPLAY, GOLD, GRAD_ACCENT, HUE, INK_3, OK, cast, fontStack, glass, tint } from "../constants";
import { StrategyWizard } from "./StrategyWizard";
import { WelcomeSlideshow, hasSeenWelcome, markWelcomeSeen } from "./WelcomeSlideshow";

export const StrategyLanding = ({ strategies, onSelect, onCreate, onDelete, userName, onLogout, onLangToggle, lang, loading, userId, userEmail, userRole }) => {
  const [showWizard, setShowWizard] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const isAr = lang === "ar";
  const hasStrategies = strategies.length > 0;

  // The gate below has existed since the slideshow was written — exported,
  // unit-tested, and never called, so nine slides played on every single app
  // open. Call it.
  //
  // Arabic sessions don't get it at all: every slide is English-only, and nine
  // English slides is a worse first impression than no slideshow. When an
  // Arabic version exists, drop the isAr check.
  useEffect(() => {
    if (loading || !userId || isAr) return;
    if (hasSeenWelcome(userId)) return;
    setShowWelcome(true);
  }, [loading, userId, isAr]);

  // Seen is seen, however it was opened.
  const dismissWelcome = () => { setShowWelcome(false); if (userId) markWelcomeSeen(userId); };
  return (
    <div className="min-h-screen text-ink" dir={isAr ? "rtl" : "ltr"} style={{ background: `linear-gradient(180deg, ${DEEP} 0%, ${DEEP_MID} 50%, ${DEEP} 100%)`, fontFamily: fontStack(isAr) }}>
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-normal" style={{ background: GRAD_ACCENT, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: FONT_DISPLAY }}>Stairs</span>
          <span className="text-[10px] text-ink-faint uppercase tracking-widest">v3.7.0</span>
        </div>
        <div className="flex items-center gap-3">
          {!isAr && <button onClick={() => setShowWelcome(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-ink-muted hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition uppercase tracking-wider" title="Watch the Stairs introduction" data-testid="watch-intro-btn">
            <span className="text-sm">🎬</span> <span className="hidden sm:inline">Watch Intro</span>
          </button>}
          <button onClick={onLangToggle} className="text-xs text-ink-muted hover:text-amber-400 transition">{isAr ? "EN" : "عربي"}</button>
          <div className="relative">
            <button onClick={() => setShowProfile(v => !v)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-ink-3 hover:text-amber-400 hover:bg-amber-500/10 transition">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${tint(GOLD, 15)}`, color: GOLD, border: `1px solid ${tint(GOLD, 25)}` }}>{(userName || "?")[0].toUpperCase()}</span>
              <span>{userName}</span>
              <span className="text-[10px]">{showProfile ? "▲" : "▼"}</span>
            </button>
            {showProfile && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfile(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 rounded-xl z-50 py-2" style={{ background: "rgb(var(--surface-raised-rgb) / 0.97)", border: `1px solid ${tint(GOLD, 19)}`, backdropFilter: "blur(20px)", boxShadow: `0 12px 40px ${cast(0.5)}` }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: `${tint(GOLD, 8)}` }}>
                    <div className="text-sm font-medium text-ink">{userName || "User"}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{userEmail || ""}</div>
                    <div className="text-[10px] text-ink-faint mt-1 uppercase tracking-wider">{userRole || "Member"}</div>
                  </div>
                  <button onClick={() => { setShowProfile(false); onLogout(); }} className="w-full text-left px-4 py-2.5 text-sm text-ink-3 hover:text-red-400 hover:bg-red-500/10 transition flex items-center gap-2">
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-6 pt-16 pb-8 text-center" data-tutorial="strategy-landing">
        <h1 className="text-3xl font-normal text-ink mb-3 flex items-center justify-center gap-3" style={{ fontFamily: FONT_DISPLAY }}><img src="/devoneers-logo.png" alt="DEVONEERS" style={{ height: "32px" }} />{isAr ? "استراتيجياتك" : "Your Strategies"}</h1>
        <p className="text-ink-muted text-sm max-w-lg mx-auto">{isAr ? "كل استراتيجية هي سلم مستقل." : "Each strategy is an independent staircase for a company, product, or project."}</p>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /></div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            <button onClick={() => setShowWizard(true)} className="group p-8 rounded-2xl border-2 border-dashed border-hairline-strong hover:border-amber-500/40 transition-all hover:scale-[1.02] flex flex-col items-center justify-center gap-4" style={{ flex: "1 1 320px", maxWidth: "380px", minHeight: "260px" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-all group-hover:scale-110" style={{ background: `${tint(GOLD, 8)}`, border: `1px solid ${tint(GOLD, 19)}` }}>+</div>
              <div className="text-center"><div className="text-ink font-medium text-sm">{isAr ? "إنشاء استراتيجية جديدة" : "Create New Strategy"}</div><div className="text-ink-faint text-xs mt-1">{isAr ? "سيساعدك الذكاء الاصطناعي" : "AI will help you build the staircase"}</div></div>
            </button>
            {strategies.map(s => {
              const statusLabel = s.source === "server" ? (s.status === "active" ? "● Active" : s.status === "archived" ? "◌ Archived" : "◦ Draft") : "● Local Draft";
              const statusColor = s.source === "server" ? (s.status === "active" ? OK : s.status === "archived" ? INK_3 : GOLD) : HUE.violet;
              return (
                <div key={s.id} className="group relative p-8 rounded-2xl transition-all hover:scale-[1.02] cursor-pointer flex flex-col" style={{ ...glass(0.5), borderColor: `${tint(s.color || GOLD, 19)}`, flex: "1 1 320px", maxWidth: "380px", minHeight: "260px" }} onClick={() => onSelect(s)}>
                  <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${s.name}"?`)) onDelete(s.id); }} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 text-xs transition p-1.5 rounded-lg hover:bg-red-500/10">✕</button>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl mb-4" style={{ background: `${tint(s.color || GOLD, 13)}`, border: `1px solid ${tint(s.color || GOLD, 19)}` }}>{s.icon || "🎯"}</div>
                  <div className="flex-1">
                    <div className="text-ink font-semibold text-base mb-1">{isAr && s.name_ar ? s.name_ar : s.name}</div>
                    <div className="text-ink-muted text-xs mb-2">{s.company}</div>
                    {s.description && <div className="text-ink-faint text-xs leading-relaxed line-clamp-2">{s.description}</div>}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <div className="text-ink-faint text-[10px]">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ""}</div>
                    <div className="flex items-center gap-2">
                      {s.element_count > 0 && <span className="text-[10px] text-ink-faint">{s.element_count} el</span>}
                      <div className="text-xs font-medium" style={{ color: statusColor }}>{statusLabel}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <StrategyWizard open={showWizard} onClose={() => setShowWizard(false)} onCreate={onCreate} lang={lang} />
      <WelcomeSlideshow
        open={showWelcome}
        onClose={dismissWelcome}
        onGetStarted={() => { dismissWelcome(); setShowWizard(true); }}
        hasStrategies={hasStrategies}
      />
      <footer className="text-center py-8 text-ink-ghost text-[10px] tracking-widest uppercase">By DEVONEERS • Stairs v3.7.0 • {new Date().getFullYear()}</footer>
    </div>
  );
};
