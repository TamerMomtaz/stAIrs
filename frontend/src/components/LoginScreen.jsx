import { useState, useEffect } from "react";
import { api, InvitesAPI, PasswordAPI } from "../api";
import { BAD, BAD_INK, CHAMPAGNE, DEEP, DEEP_MID, FONT_DISPLAY, GOLD, GOLD_L, GRAD_ACCENT, INK, INK_3, INK_MUTED, OK, OK_INK, RAISED, cast, inputCls, tint } from "../constants";
import { useEscape } from "./SharedUI";
export const LoginScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login"); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [orgName, setOrgName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  useEscape(showForgot, () => setShowForgot(false));
  // ── Password reset redemption (?reset=<token>) ──
  const [resetToken, setResetToken] = useState("");
  const [reset, setReset] = useState(null);        // { valid, reason, email }
  const [resetPass, setResetPass] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetDone, setResetDone] = useState(false);
  // ── Invitation state ──
  // An invite decides which organisation the account joins, so it is resolved
  // before the form is usable rather than discovered on submit.
  const [inviteToken, setInviteToken] = useState("");
  const [invite, setInvite] = useState(null);      // { valid, reason, organization_name, role, email }
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [showInviteField, setShowInviteField] = useState(false);

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const checkInvite = async (token) => {
    const t = (token || "").trim();
    if (!t) { setInvite(null); return; }
    setCheckingInvite(true);
    const res = await InvitesAPI.preview(t);
    setInvite(res);
    setCheckingInvite(false);
    // An invitation addressed to someone specific fills their address in, so
    // they can't fail the email check by typing a different one.
    if (res?.valid && res.email) setEmail(prev => prev || res.email);
    return res;
  };

  // ?invite=<token> — the link an admin sends. Land straight on the join form.
  // ?reset=<token> — the password reset link. Same idea.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setInviteToken(invite);
      setMode("signup");
      setShowInviteField(true);
      checkInvite(invite);
      return;
    }
    const rt = params.get("reset");
    if (rt) {
      setResetToken(rt);
      PasswordAPI.previewReset(rt).then(setReset);
    }
  }, []);

  const submitReset = async (e) => {
    e.preventDefault(); setErr("");
    if (resetPass.length < 8) { setErr("Password must be at least 8 characters"); return; }
    if (resetPass !== resetConfirm) { setErr("Passwords do not match"); return; }
    setBusy(true);
    try { await PasswordAPI.redeemReset(resetToken, resetPass); setResetDone(true); }
    catch (ex) { setErr(ex.message || "Couldn't reset the password"); }
    setBusy(false);
  };

  // Joining is only offered when the invitation actually checks out. A broken
  // token must never quietly fall through to creating a new organisation —
  // that is how an invited colleague lands alone in an empty workspace.
  const joining = !!(inviteToken.trim() && invite?.valid);

  const handleLogin = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); } catch { setErr("Invalid credentials"); }
    setBusy(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    if (!name.trim()) { setErr("Name is required"); setBusy(false); return; }
    if (!validateEmail(email)) { setErr("Please enter a valid email address"); setBusy(false); return; }
    if (pass.length < 8) { setErr("Password must be at least 8 characters"); setBusy(false); return; }
    if (pass !== confirmPass) { setErr("Passwords do not match"); setBusy(false); return; }
    // A token that was typed but hasn't checked out stops the submit outright.
    // Falling back to "create a new organisation" would silently put them
    // somewhere other than where they were invited.
    if (inviteToken.trim() && !invite?.valid) {
      setErr(invite?.reason || "That invitation code couldn't be verified. Check it and try again.");
      setBusy(false); return;
    }
    if (!joining && !orgName.trim()) { setErr("Organisation name is required"); setBusy(false); return; }
    try {
      await api.signup(name.trim(), email, pass, confirmPass,
        joining ? { inviteToken: inviteToken.trim() } : { orgName: orgName.trim() });
      onLogin(api.user);
    } catch (ex) { setErr(ex.message || "Signup failed"); }
    setBusy(false);
  };

  const switchMode = (m) => { setMode(m); setErr(""); };

  const inviteStyle = { padding: "14px 18px", fontSize: "15px", height: "48px" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: `linear-gradient(135deg, ${DEEP} 0%, ${RAISED} 40%, ${RAISED} 70%, ${DEEP_MID} 100%)` }}>
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "440px", padding: "48px 40px", borderRadius: "16px", backdropFilter: "blur(20px)", background: "rgb(var(--surface-raised-rgb) / 0.85)", border: `1px solid ${tint(GOLD, 20)}`, boxShadow: `0 25px 60px ${cast(0.5)}` }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "52px", fontWeight: 400, letterSpacing: "-1px", marginBottom: "8px", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L}, ${CHAMPAGNE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: FONT_DISPLAY }}>Stairs</div>
          <div style={{ color: INK_3, fontSize: "13px", letterSpacing: "4px", textTransform: "uppercase", marginTop: "4px" }}>Strategic Staircase</div>
          <div style={{ width: "64px", height: "2px", margin: "16px auto 0", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>

        {resetToken ? (
          <div data-testid="reset-screen">
            {resetDone ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ color: OK_INK, fontSize: "15px", marginBottom: "8px" }}>Password updated</div>
                <p style={{ color: INK_3, fontSize: "13px", marginBottom: "20px" }}>You can sign in with your new password now.</p>
                <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" type="button" onClick={() => { setResetToken(""); setReset(null); setResetDone(false); setMode("login"); }} style={{ width: "100%", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "15px", color: DEEP, border: "none", cursor: "pointer", background: GRAD_ACCENT }}>Go to sign in</button>
              </div>
            ) : reset === null ? (
              <div style={{ textAlign: "center", color: INK_3, fontSize: "13px", padding: "24px 0" }}>Checking your reset link…</div>
            ) : !reset.valid ? (
              <div data-testid="reset-invalid">
                <div style={{ padding: "12px 14px", borderRadius: "10px", background: tint(BAD, 10), border: `1px solid ${tint(BAD, 35)}`, color: BAD_INK, fontSize: "13px", marginBottom: "16px" }}>
                  <strong>This reset link can't be used</strong>
                  <div style={{ marginTop: "4px" }}>{reset.reason}</div>
                </div>
                <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" type="button" onClick={() => { setResetToken(""); setReset(null); setMode("login"); }} style={{ width: "100%", padding: "12px", borderRadius: "10px", fontSize: "14px", color: INK_3, background: "transparent", border: `1px solid ${tint(GOLD, 15)}`, cursor: "pointer" }}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={submitReset} noValidate>
                <p style={{ color: INK_3, fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>
                  Choose a new password for <span style={{ color: INK }}>{reset.email}</span>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <input type="password" value={resetPass} onChange={e => setResetPass(e.target.value)} placeholder="New password (min 8 characters)" className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} data-testid="reset-password" />
                  <input type="password" value={resetConfirm} onChange={e => setResetConfirm(e.target.value)} placeholder="Confirm new password" className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} data-testid="reset-confirm" />
                </div>
                {err && <div style={{ marginTop: "12px", color: BAD, fontSize: "14px", textAlign: "center" }} data-testid="reset-error">{err}</div>}
                <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: DEEP, border: "none", cursor: "pointer", background: GRAD_ACCENT, opacity: busy ? 0.5 : 1 }} data-testid="reset-submit">
                  {busy ? "..." : "Set new password"}
                </button>
              </form>
            )}
          </div>
        ) : (
        <>
        {/* Tab switcher */}
        <div style={{ display: "flex", marginBottom: "24px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${tint(GOLD, 15)}` }}>
          <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" type="button" onClick={() => switchMode("login")} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", background: mode === "login" ? GRAD_ACCENT : "transparent", color: mode === "login" ? DEEP : INK_3, transition: "all 0.2s" }}>Sign In</button>
          <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" type="button" onClick={() => switchMode("signup")} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", background: mode === "signup" ? GRAD_ACCENT : "transparent", color: mode === "signup" ? DEEP : INK_3, transition: "all 0.2s" }}>Create Account</button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
            </div>
            {err && <div style={{ marginTop: "12px", color: BAD, fontSize: "14px", textAlign: "center" }}>{err}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: DEEP, border: "none", cursor: "pointer", background: GRAD_ACCENT, opacity: busy ? 0.5 : 1, transition: "transform 0.2s" }}>{busy ? "..." : "Sign In"}</button>
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button className="transition text-ink-muted hover:text-accent-ink" type="button" onClick={() => setShowForgot(true)} style={{ background: "none", border: "none", fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Forgot Password?</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup} noValidate>
            {/* Invitation banner — what this account is about to join, decided
                before anything is typed rather than discovered on submit. */}
            {checkingInvite && (
              <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", background: tint(INK_3, 8), border: `1px solid ${tint(INK_3, 20)}`, color: INK_3, fontSize: "13px" }} data-testid="invite-checking">
                Checking your invitation…
              </div>
            )}
            {!checkingInvite && invite?.valid && (
              <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", background: tint(OK, 10), border: `1px solid ${tint(OK, 30)}`, color: OK_INK, fontSize: "13px" }} data-testid="invite-valid">
                <strong style={{ color: "#a7f3d0" }}>You've been invited to join {invite.organization_name}</strong>
                <div style={{ marginTop: "4px", color: INK_3 }}>
                  You'll join as a {invite.role}. Your account will use this organisation's existing workspace.
                </div>
              </div>
            )}
            {!checkingInvite && inviteToken.trim() && invite && !invite.valid && (
              <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", background: tint(BAD, 10), border: `1px solid ${tint(BAD, 35)}`, color: BAD_INK, fontSize: "13px" }} data-testid="invite-invalid">
                <strong>This invitation can't be used</strong>
                <div style={{ marginTop: "4px" }}>{invite.reason}</div>
                <div style={{ marginTop: "8px", color: INK_3 }}>
                  Clear the code below to create a new organisation instead — but if you were invited to an existing
                  team, ask for a fresh link rather than signing up separately.
                </div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              {!joining && (
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Organisation Name" required className={inputCls} style={inviteStyle} data-testid="org-name-input" />
              )}
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password (min 8 characters)" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirm Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              {showInviteField ? (
                <input
                  type="text"
                  value={inviteToken}
                  onChange={e => { setInviteToken(e.target.value); setInvite(null); }}
                  onBlur={e => checkInvite(e.target.value)}
                  placeholder="Invitation code"
                  className={inputCls}
                  style={inviteStyle}
                  data-testid="invite-input"
                />
              ) : (
                <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" type="button" onClick={() => setShowInviteField(true)} style={{ background: "none", border: "none", color: INK_MUTED, fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: 0, textAlign: "left" }} data-testid="have-invite-btn">
                  Have an invitation code?
                </button>
              )}
            </div>
            {err && <div style={{ marginTop: "12px", color: BAD, fontSize: "14px", textAlign: "center" }} data-testid="signup-error">{err}</div>}
            <button type="submit" data-testid="signup-submit" disabled={busy || checkingInvite} style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: DEEP, border: "none", cursor: "pointer", background: GRAD_ACCENT, opacity: (busy || checkingInvite) ? 0.5 : 1, transition: "transform 0.2s" }}>
              {busy ? "..." : joining ? `Join ${invite.organization_name}` : "Create Account"}
            </button>
          </form>
        )}

        </>
        )}

        {/* Forgot password modal */}
        {showForgot && (
          <div style={{ position: "fixed", inset: 0, background: cast(0.6), display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowForgot(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: RAISED, border: `1px solid ${tint(GOLD, 20)}`, borderRadius: "12px", padding: "32px", maxWidth: "400px", width: "90%", textAlign: "center" }}>
              <div style={{ fontSize: "20px", marginBottom: "12px" }}>Reset your password</div>
              <p style={{ color: INK_3, fontSize: "14px", marginBottom: "20px" }}>Ask an administrator in your organisation to send you a reset link. They can create one from their profile menu, under Change password. Opening that link lets you choose a new password yourself — nobody else sees it.</p>
              <button className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)]" onClick={() => setShowForgot(false)} style={{ padding: "10px 24px", borderRadius: "8px", fontWeight: 600, fontSize: "14px", color: DEEP, border: "none", cursor: "pointer", background: GRAD_ACCENT }}>OK</button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "24px", color: "#4b5563", fontSize: "12px" }}>By DEVONEERS</div>
      </div>
    </div>
  );
};
