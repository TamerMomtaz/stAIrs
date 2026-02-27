import { useState, useEffect, useCallback, useRef } from "react";
import { GOLD, GOLD_L, BORDER, DEEP } from "../constants";
import {
  tutorialSteps,
  TUTORIAL_VERSION,
  getTutorialState,
  saveTutorialState,
  getDefaultTutorialState,
} from "../tutorialConfig";

// ═══ CONFETTI PARTICLE ═══
const Particle = ({ delay, x }) => (
  <div
    className="tutorial-confetti-particle"
    style={{
      left: `${x}%`,
      animationDelay: `${delay}ms`,
      background: [GOLD, GOLD_L, "#34d399", "#60a5fa", "#a78bfa", "#f472b6"][
        Math.floor(Math.random() * 6)
      ],
    }}
  />
);

// ═══ STEP COMPLETE CHECKMARK ═══
const StepReward = ({ visible }) => {
  if (!visible) return null;
  return (
    <div className="tutorial-reward">
      <svg width="32" height="32" viewBox="0 0 32 32" className="tutorial-reward-svg">
        <circle cx="16" cy="16" r="14" fill="none" stroke={GOLD} strokeWidth="2" className="tutorial-reward-circle" />
        <path d="M10 16 L14 20 L22 12" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tutorial-reward-check" />
      </svg>
    </div>
  );
};

// ═══ MAIN TUTORIAL OVERLAY ═══
export const TutorialOverlay = ({ active, onClose, steps: customSteps }) => {
  const steps = customSteps || tutorialSteps;
  const [currentStep, setCurrentStep] = useState(0);
  const [showReward, setShowReward] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [targetRect, setTargetRect] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const tooltipRef = useRef(null);
  const confettiParticles = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 600,
    }))
  );

  const step = steps[currentStep];

  // Find and measure the target element
  const measureTarget = useCallback(() => {
    if (!step?.selector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!active) return;
    measureTarget();
    const handleResize = () => measureTarget();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [active, currentStep, measureTarget]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handleBack();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, currentStep]);

  const handleNext = () => {
    if (isComplete) {
      finishTutorial();
      return;
    }

    // Show reward animation
    setShowReward(true);
    setTimeout(() => setShowReward(false), 700);

    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      // Final step — show completion
      setIsComplete(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setIsComplete(false);
      setCurrentStep((s) => s - 1);
    }
  };

  const finishTutorial = () => {
    const state = getTutorialState() || getDefaultTutorialState();
    state.completedVersion = TUTORIAL_VERSION;
    state.completedStepIds = steps.map((s) => s.id);
    state.dismissed = false;
    saveTutorialState(state);
    setCurrentStep(0);
    setIsComplete(false);
    onClose();
  };

  const handleSkip = () => {
    const state = getTutorialState() || getDefaultTutorialState();
    state.dismissed = true;
    state.completedVersion = TUTORIAL_VERSION;
    state.completedStepIds = steps.slice(0, currentStep).map((s) => s.id);
    saveTutorialState(state);
    setCurrentStep(0);
    setIsComplete(false);
    onClose();
  };

  if (!active) return null;

  // Calculate tooltip position
  const getTooltipStyle = () => {
    if (!targetRect) {
      // Center on screen for welcome/no-selector steps
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
    const padding = 16;
    const tooltipWidth = 380;
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let top, left;

    // Prefer placing below the element
    if (targetRect.top + targetRect.height + padding + 220 < viewH) {
      top = targetRect.top + targetRect.height + padding;
      left = Math.max(padding, Math.min(centerX - tooltipWidth / 2, viewW - tooltipWidth - padding));
    }
    // Place above
    else if (targetRect.top - padding - 220 > 0) {
      top = targetRect.top - padding - 220;
      left = Math.max(padding, Math.min(centerX - tooltipWidth / 2, viewW - tooltipWidth - padding));
    }
    // Place to the right
    else if (targetRect.left + targetRect.width + padding + tooltipWidth < viewW) {
      top = Math.max(padding, centerY - 110);
      left = targetRect.left + targetRect.width + padding;
    }
    // Place to the left
    else {
      top = Math.max(padding, centerY - 110);
      left = Math.max(padding, targetRect.left - tooltipWidth - padding);
    }

    return { position: "fixed", top, left };
  };

  return (
    <div className="fixed inset-0 z-[200]" data-testid="tutorial-overlay">
      {/* Dimming overlay with spotlight cutout */}
      <svg className="fixed inset-0 w-full h-full" style={{ zIndex: 200 }}>
        <defs>
          <mask id="tutorial-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 8}
                y={targetRect.top - 8}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.82)"
          mask="url(#tutorial-spotlight-mask)"
        />
      </svg>

      {/* Glowing border around target */}
      {targetRect && (
        <div
          className="tutorial-spotlight-ring"
          style={{
            position: "fixed",
            zIndex: 201,
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: "12px",
            border: `2px solid ${GOLD}`,
            boxShadow: `0 0 20px ${GOLD}44, 0 0 40px ${GOLD}22, inset 0 0 20px ${GOLD}11`,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip Card */}
      {!isComplete && (
        <div
          ref={tooltipRef}
          className="tutorial-tooltip"
          style={{
            ...getTooltipStyle(),
            zIndex: 202,
            width: 380,
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(15, 25, 50, 0.97)",
              border: `1px solid ${GOLD}44`,
              boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 30px ${GOLD}15`,
            }}
          >
            {/* Progress bar */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
                  Step {currentStep + 1} of {steps.length}
                </span>
                <button
                  onClick={handleSkip}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition uppercase tracking-wider"
                >
                  Skip Tutorial
                </button>
              </div>
              <div className="w-full h-1 rounded-full bg-[#1e3a5f]/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${((currentStep + 1) / steps.length) * 100}%`,
                    background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})`,
                  }}
                />
              </div>
            </div>

            {/* Step content */}
            <div className="px-5 py-4">
              {step.id === "welcome" && (
                <div className="flex justify-center mb-3">
                  <img src="/devoneers-logo.png" alt="DEVONEERS" style={{ height: "32px" }} />
                </div>
              )}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{step.icon}</span>
                <h3
                  className="text-base font-semibold"
                  style={{
                    background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {step.title}
                </h3>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>
            </div>

            {/* Navigation */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: `1px solid ${GOLD}15` }}
            >
              <button
                onClick={handleBack}
                disabled={currentStep === 0}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition disabled:opacity-30 disabled:cursor-default rounded-lg hover:bg-white/5"
              >
                ← Back
              </button>
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      background: i === currentStep ? GOLD : i < currentStep ? `${GOLD}66` : "#1e3a5f",
                      transform: i === currentStep ? "scale(1.4)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
              <button
                onClick={handleNext}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg transition"
                style={{
                  background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                  color: DEEP,
                }}
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next →"}
              </button>
            </div>
          </div>

          {/* Step complete reward */}
          <StepReward visible={showReward} />
        </div>
      )}

      {/* Completion screen */}
      {isComplete && (
        <div className="fixed inset-0 z-[203] flex items-center justify-center">
          <div
            className="tutorial-completion rounded-2xl p-8 text-center max-w-md mx-4"
            style={{
              background: "rgba(15, 25, 50, 0.97)",
              border: `1px solid ${GOLD}44`,
              boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}20`,
            }}
          >
            <div className="text-5xl mb-4 tutorial-completion-icon">🪜</div>
            <h2
              className="text-2xl font-bold mb-2"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              You're ready to climb!
            </h2>
            <p className="text-gray-400 text-sm mb-6 leading-relaxed">
              You've completed the ST.AIRS tour. Every feature is now at your
              fingertips — go build something strategic.
            </p>
            <button
              onClick={finishTutorial}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold transition hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                color: DEEP,
              }}
            >
              Let's Go
            </button>
          </div>

          {/* Confetti */}
          {showConfetti && (
            <div className="fixed inset-0 pointer-events-none z-[204] overflow-hidden">
              {confettiParticles.current.map((p) => (
                <Particle key={p.id} x={p.x} delay={p.delay} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══ NEW FEATURES PROMPT ═══
export const TutorialUpdatePrompt = ({ onStart, onDismiss }) => (
  <div
    className="fixed bottom-6 right-6 z-[150] tutorial-slide-up"
    style={{ maxWidth: 340 }}
    data-testid="tutorial-update-prompt"
  >
    <div
      className="rounded-xl p-4"
      style={{
        background: "rgba(15, 25, 50, 0.97)",
        border: `1px solid ${GOLD}44`,
        boxShadow: `0 15px 40px rgba(0,0,0,0.5), 0 0 20px ${GOLD}10`,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5">🆕</span>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-white mb-1">New features added!</h4>
          <p className="text-xs text-gray-400 leading-relaxed mb-3">
            Want a quick tour of what's new?
          </p>
          <div className="flex gap-2">
            <button
              onClick={onStart}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`,
                color: DEEP,
              }}
            >
              Show me
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 rounded-lg hover:bg-white/5 transition"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ═══ FEATURES EXPLORED BADGE ═══
export const FeaturesExploredBadge = ({ show, onClose }) => {
  const [state, setState] = useState(null);

  useEffect(() => {
    const s = getTutorialState();
    if (s) setState(s);
  }, [show]);

  if (!show || !state) return null;

  const totalFeatures = tutorialSteps.filter((s) => s.featureKey).length;
  const usedCount = state.featuresUsed?.length || 0;
  const percent = totalFeatures > 0 ? Math.round((usedCount / totalFeatures) * 100) : 0;

  return (
    <div className="fixed bottom-6 left-6 z-[150] tutorial-slide-up" data-testid="features-badge">
      <div
        className="rounded-xl p-4 w-72"
        style={{
          background: "rgba(15, 25, 50, 0.97)",
          border: `1px solid ${GOLD}33`,
          boxShadow: `0 15px 40px rgba(0,0,0,0.4)`,
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Features Explored
          </h4>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-400 transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-[#1e3a5f]/50 overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${GOLD}, ${GOLD_L})`,
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-3">
          <span>
            {usedCount} / {totalFeatures} features
          </span>
          <span style={{ color: percent === 100 ? GOLD : undefined }}>
            {percent}%
          </span>
        </div>

        {/* Feature list */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {tutorialSteps
            .filter((s) => s.featureKey)
            .map((s) => {
              const used = state.featuresUsed?.includes(s.featureKey);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="w-4 h-4 flex items-center justify-center rounded-full text-[9px] shrink-0"
                    style={{
                      background: used ? `${GOLD}22` : "#1e3a5f33",
                      color: used ? GOLD : "#475569",
                      border: `1px solid ${used ? `${GOLD}44` : "#1e3a5f"}`,
                    }}
                  >
                    {used ? "✓" : "·"}
                  </span>
                  <span className={used ? "text-gray-300" : "text-gray-600"}>
                    {s.title}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
