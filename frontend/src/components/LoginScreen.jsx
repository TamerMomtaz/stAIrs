import { useState } from "react";
import { api } from "../api";
import { GOLD, GOLD_L, CHAMPAGNE, DEEP, inputCls } from "../constants";

export const LoginScreen = ({ onLogin }) => {
  const [mode, setMode] = useState("login"); // "login" or "signup"
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

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
    try { await api.signup(name.trim(), email, pass, confirmPass); onLogin(api.user); } catch (ex) { setErr(ex.message || "Signup failed"); }
    setBusy(false);
  };

  const switchMode = (m) => { setMode(m); setErr(""); };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: `linear-gradient(135deg, ${DEEP} 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)` }}>
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "440px", padding: "48px 40px", borderRadius: "16px", backdropFilter: "blur(20px)", background: "rgba(22, 37, 68, 0.85)", border: `1px solid ${GOLD}33`, boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "52px", fontWeight: "bold", letterSpacing: "-1px", marginBottom: "8px", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L}, ${CHAMPAGNE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>Stairs</div>
          <div style={{ color: "#9ca3af", fontSize: "13px", letterSpacing: "4px", textTransform: "uppercase", marginTop: "4px" }}>Strategic Staircase</div>
          <div style={{ width: "64px", height: "2px", margin: "16px auto 0", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", marginBottom: "24px", borderRadius: "10px", overflow: "hidden", border: `1px solid ${GOLD}25` }}>
          <button type="button" onClick={() => switchMode("login")} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", background: mode === "login" ? `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` : "transparent", color: mode === "login" ? "#0a1628" : "#9ca3af", transition: "all 0.2s" }}>Sign In</button>
          <button type="button" onClick={() => switchMode("signup")} style={{ flex: 1, padding: "10px", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", background: mode === "signup" ? `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` : "transparent", color: mode === "signup" ? "#0a1628" : "#9ca3af", transition: "all 0.2s" }}>Create Account</button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
            </div>
            {err && <div style={{ marginTop: "12px", color: "#f87171", fontSize: "14px", textAlign: "center" }}>{err}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: "#0a1628", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, opacity: busy ? 0.5 : 1, transition: "transform 0.2s" }}>{busy ? "..." : "Sign In"}</button>
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button type="button" onClick={() => setShowForgot(true)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Forgot Password?</button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password (min 8 characters)" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
              <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirm Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
            </div>
            {err && <div style={{ marginTop: "12px", color: "#f87171", fontSize: "14px", textAlign: "center" }}>{err}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "24px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: "#0a1628", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, opacity: busy ? 0.5 : 1, transition: "transform 0.2s" }}>{busy ? "..." : "Create Account"}</button>
          </form>
        )}

        {/* Forgot password modal */}
        {showForgot && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowForgot(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#162544", border: `1px solid ${GOLD}33`, borderRadius: "12px", padding: "32px", maxWidth: "400px", width: "90%", textAlign: "center" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>Coming Soon</div>
              <p style={{ color: "#9ca3af", fontSize: "14px", marginBottom: "20px" }}>Password reset functionality is coming soon. Please contact your administrator to reset your password.</p>
              <button onClick={() => setShowForgot(false)} style={{ padding: "10px 24px", borderRadius: "8px", fontWeight: 600, fontSize: "14px", color: "#0a1628", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})` }}>OK</button>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "24px", color: "#4b5563", fontSize: "12px" }}>By DEVONEERS</div>
      </div>
    </div>
  );
};
