import { useState, useEffect, useCallback } from "react";
import { api, PasswordAPI } from "../api";
import { GOLD, GOLD_L, DEEP, BORDER, glass, inputCls } from "../constants";
import { Modal } from "./SharedUI";

// The token is shown once, at creation — the list endpoint withholds it, so
// this screen can't be used to harvest live reset links.
const FreshReset = ({ reset, onDone, isAr }) => {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?reset=${encodeURIComponent(reset.token)}`;
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.30)" }}>
      <div className="text-emerald-300 text-sm font-semibold mb-1">
        {isAr ? "تم إنشاء رابط إعادة التعيين" : "Reset link created"}
      </div>
      <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
        {isAr
          ? `انسخ الرابط الآن — لن يُعرض مرة أخرى. أرسله إلى ${reset.email} بوسيلة تثق بها.`
          : `Copy this now — it is never shown again. Send it to ${reset.email} however you normally reach them.`}
      </p>
      <div className="flex gap-2">
        <input readOnly value={link} className={inputCls} style={{ padding: "10px 12px", fontSize: "12px" }} data-testid="reset-link" />
        <button
          onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}
          className="px-3 py-2 rounded-lg text-xs font-semibold shrink-0"
          style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }}>
          {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
        </button>
      </div>
      <button onClick={onDone} className="mt-3 text-xs text-gray-400 hover:text-white transition">
        {isAr ? "تم" : "Done"}
      </button>
    </div>
  );
};

export const PasswordManager = ({ open, onClose, lang, currentUserRole }) => {
  const isAr = lang === "ar";
  const isAdmin = currentUserRole === "admin";

  // ── Change your own ──
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  // ── Admin: reset links ──
  const [resets, setResets] = useState([]);
  const [resetEmail, setResetEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [resetError, setResetError] = useState("");
  const [fresh, setFresh] = useState(null);

  const loadResets = useCallback(async () => {
    if (!open || !isAdmin) return;
    try { setResets(await PasswordAPI.listResets()); } catch { setResets([]); }
  }, [open, isAdmin]);
  useEffect(() => { loadResets(); }, [loadResets]);

  const submit = async () => {
    if (busy) return;
    setError(""); setDone(null);
    if (next.length < 8) { setError(isAr ? "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل" : "The new password must be at least 8 characters"); return; }
    if (next !== confirm) { setError(isAr ? "كلمتا المرور غير متطابقتين" : "The new passwords don't match"); return; }
    setBusy(true);
    try {
      const r = await PasswordAPI.change(current, next);
      setDone(r.note || (isAr ? "تم تغيير كلمة المرور" : "Password changed"));
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) { setError(e.message || "Couldn't change the password"); }
    setBusy(false);
  };

  const createReset = async () => {
    if (creating) return;
    setCreating(true); setResetError("");
    try {
      setFresh(await PasswordAPI.createReset(resetEmail.trim()));
      setResetEmail("");
      loadResets();
    } catch (e) { setResetError(e.message || "Couldn't create the reset link"); }
    setCreating(false);
  };

  const statusOf = (r) => {
    if (r.revoked_at) return { label: isAr ? "ملغى" : "Revoked", cls: "text-gray-500" };
    if (r.used_at) return { label: isAr ? "مستخدم" : "Used", cls: "text-emerald-400" };
    if (r.expires_at && new Date(r.expires_at) <= new Date()) return { label: isAr ? "منتهٍ" : "Expired", cls: "text-amber-400" };
    return { label: isAr ? "في الانتظار" : "Pending", cls: "text-blue-400" };
  };

  return (
    <Modal open={open} onClose={onClose} title={isAr ? "كلمة المرور" : "Password"} size="lg">
      <div className="space-y-6">
        <div className="rounded-xl p-4" style={glass(0.4)}>
          <div className="text-sm text-white font-medium mb-3">{isAr ? "غيّر كلمة مرورك" : "Change your password"}</div>
          <div className="space-y-3">
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder={isAr ? "كلمة المرور الحالية" : "Current password"} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="current-password" />
            <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder={isAr ? "كلمة مرور جديدة (8 أحرف على الأقل)" : "New password (at least 8 characters)"} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="new-password" />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={isAr ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="confirm-password" />
          </div>
          {error && <div className="text-xs text-red-400 mt-3" data-testid="password-error">{error}</div>}
          {done && <div className="text-xs text-emerald-400 mt-3 leading-relaxed" data-testid="password-done">✓ {done}</div>}
          <button onClick={submit} disabled={busy || !current || !next} className="mt-4 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition hover:scale-[1.01]" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }} data-testid="submit-password">
            {busy ? "..." : (isAr ? "تغيير كلمة المرور" : "Change password")}
          </button>
        </div>

        {isAdmin && (
          <div>
            <div className="text-sm text-white font-medium mb-1">{isAr ? "إعادة تعيين لشخص آخر" : "Reset someone else's password"}</div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              {isAr
                ? "أنشئ رابطًا لمرة واحدة لعضو في مؤسستك. لا يمكنك رؤية كلمة مرورهم أو تعيينها — هم من يختارها."
                : "Create a single-use link for someone in your organisation. You can't see or set their password — they choose it."}
            </p>
            {fresh ? (
              <FreshReset reset={fresh} onDone={() => setFresh(null)} isAr={isAr} />
            ) : (
              <div className="rounded-xl p-4" style={glass(0.4)}>
                <div className="flex gap-2">
                  <input value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="colleague@company.com" className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="reset-email" />
                  <button onClick={createReset} disabled={creating || !resetEmail.trim()} className="px-4 py-2 rounded-lg text-xs font-semibold shrink-0 disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_L})`, color: DEEP }} data-testid="create-reset">
                    {creating ? "..." : (isAr ? "إنشاء رابط" : "Create link")}
                  </button>
                </div>
                {resetError && <div className="text-xs text-red-400 mt-3" data-testid="reset-error">{resetError}</div>}
              </div>
            )}

            {resets.length > 0 && (
              <div className="space-y-1.5 mt-3 max-h-52 overflow-y-auto">
                {resets.map(r => {
                  const st = statusOf(r);
                  const pending = !r.revoked_at && !r.used_at && (!r.expires_at || new Date(r.expires_at) > new Date());
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={glass(0.3)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-200 truncate">{r.email}</div>
                        {r.expires_at && <div className="text-[10px] text-gray-600 mt-0.5">{isAr ? "ينتهي" : "expires"} {new Date(r.expires_at).toLocaleString()}</div>}
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${st.cls}`}>{st.label}</span>
                      {pending && (
                        <button onClick={() => PasswordAPI.revokeReset(r.id).then(loadResets)} className="text-[10px] text-gray-600 hover:text-red-400 transition px-2 py-1 rounded hover:bg-red-500/10 shrink-0" data-testid={`revoke-reset-${r.id}`}>
                          {isAr ? "إلغاء" : "Revoke"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-600 leading-relaxed" style={{ borderTop: `1px solid ${BORDER}`, paddingTop: "12px" }}>
          {isAr
            ? "ملاحظة: تغيير كلمة المرور لا يُنهي الجلسات المفتوحة على أجهزة أخرى — تبقى صالحة حتى تنتهي صلاحية الرمز."
            : "Note: changing a password does not end sessions already signed in elsewhere. Those stay valid until their token expires."}
        </p>
      </div>
    </Modal>
  );
};
