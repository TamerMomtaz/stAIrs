import { useState } from "react";
import { api } from "../api";
import { GOLD, GOLD_L, CHAMPAGNE, DEEP, inputCls } from "../constants";

export const LoginScreen = ({ onLogin }) => {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await api.login(email, pass); onLogin(api.user); } catch { setErr("Invalid credentials"); }
    setBusy(false);
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", background: `linear-gradient(135deg, ${DEEP} 0%, #162544 40%, #1a3055 70%, #0f1f3a 100%)` }}>
      <form onSubmit={go} style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: "440px", padding: "48px 40px", borderRadius: "16px", backdropFilter: "blur(20px)", background: "rgba(22, 37, 68, 0.85)", border: `1px solid ${GOLD}33`, boxShadow: "0 25px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{ fontSize: "52px", fontWeight: "bold", letterSpacing: "-1px", marginBottom: "8px", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L}, ${CHAMPAGNE})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Instrument Serif', Georgia, serif" }}>ST.AIRS</div>
          <div style={{ color: "#9ca3af", fontSize: "13px", letterSpacing: "4px", textTransform: "uppercase", marginTop: "4px" }}>Strategic Staircase</div>
          <div style={{ width: "64px", height: "2px", margin: "16px auto 0", background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Password" required className={inputCls} style={{ padding: "14px 18px", fontSize: "15px", height: "48px" }} />
        </div>
        {err && <div style={{ marginTop: "12px", color: "#f87171", fontSize: "14px", textAlign: "center" }}>{err}</div>}
        <button type="submit" disabled={busy} style={{ width: "100%", marginTop: "32px", padding: "14px", borderRadius: "10px", fontWeight: 600, fontSize: "16px", color: "#0a1628", border: "none", cursor: "pointer", background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, opacity: busy ? 0.5 : 1, transition: "transform 0.2s" }}>{busy ? "..." : "Sign In"}</button>
        <div style={{ textAlign: "center", marginTop: "24px", color: "#4b5563", fontSize: "12px" }}>By DEVONEERS</div>
      </form>
    </div>
  );
};
