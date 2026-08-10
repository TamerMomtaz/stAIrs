import { useState, useEffect, useCallback } from "react";
import { InvitesAPI } from "../api";
import { BORDER, DEEP, GRAD_ACCENT, INK_ON_ACCENT, OK, glass, inputCls, tint } from "../constants";
import { Modal } from "./SharedUI";

const ROLES = [
  { value: "member", label: "Member", hint: "Can work in the organisation's strategies" },
  { value: "manager", label: "Manager", hint: "Same access, for people who lead delivery" },
  { value: "viewer", label: "Viewer", hint: "Intended for read-only observers" },
  { value: "admin", label: "Admin", hint: "Can also invite and remove people" },
];

const EXPIRY = [
  { value: 24, label: "24 hours" },
  { value: 168, label: "7 days" },
  { value: 720, label: "30 days" },
];

// The token is shown exactly once, at creation — the list endpoint withholds it
// so this screen can't be used to harvest live invitations. That makes copying
// it here the only chance, so it is presented as the main event.
const FreshInvite = ({ invite, onDone, isAr }) => {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?invite=${encodeURIComponent(invite.token)}`;
  const copy = (text) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  return (
    <div className="rounded-xl p-4" style={{ background: tint(OK, 8), border: `1px solid ${tint(OK, 30)}` }}>
      <div className="text-emerald-300 text-sm font-semibold mb-1">
        {isAr ? "تم إنشاء الدعوة" : "Invitation created"}
      </div>
      <p className="text-[11px] text-ink-3 mb-3 leading-relaxed">
        {isAr
          ? "انسخ الرابط الآن — لن يُعرض هذا الرمز مرة أخرى. أرسله إلى الشخص المدعو بأي وسيلة تثق بها."
          : "Copy this now — the code is never shown again. Send it to the person you're inviting however you normally reach them."}
      </p>
      <div className="flex gap-2 mb-2">
        <input readOnly value={link} className={inputCls} style={{ padding: "10px 12px", fontSize: "12px" }} data-testid="invite-link" />
        <button onClick={() => copy(link)} className="transition hover:brightness-[var(--hover-lift)] active:brightness-[var(--press-lift)] px-3 py-2 rounded-lg text-xs font-semibold shrink-0" style={{ background: GRAD_ACCENT, color: INK_ON_ACCENT }}>
          {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ الرابط" : "Copy link")}
        </button>
      </div>
      <button onClick={() => copy(invite.token)} className="text-[11px] text-ink-muted hover:text-amber-400 transition underline">
        {isAr ? "انسخ الرمز فقط" : "Copy just the code"}
      </button>
      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
        <button onClick={onDone} className="text-xs text-ink-3 hover:text-ink transition">
          {isAr ? "تم" : "Done"}
        </button>
      </div>
    </div>
  );
};

export const InviteManager = ({ open, onClose, lang, currentUserRole }) => {
  const isAr = lang === "ar";
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [expiry, setExpiry] = useState(168);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [fresh, setFresh] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const isAdmin = currentUserRole === "admin";

  const load = useCallback(async () => {
    if (!open || !isAdmin) return;
    setLoading(true); setLoadError("");
    try { setInvites(await InvitesAPI.list()); }
    catch (e) { setLoadError(e.message || "Couldn't load invitations"); }
    setLoading(false);
  }, [open, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (creating) return;
    setCreating(true); setCreateError("");
    try {
      const inv = await InvitesAPI.create({ email: email.trim() || null, role, expiresInHours: expiry });
      setFresh(inv);
      setEmail("");
      load();
    } catch (e) { setCreateError(e.message || "Couldn't create the invitation"); }
    setCreating(false);
  };

  const revoke = async (id) => {
    setRevoking(id);
    try { await InvitesAPI.revoke(id); await load(); }
    catch (e) { setLoadError(e.message || "Couldn't revoke that invitation"); }
    setRevoking(null);
  };

  const statusOf = (i) => {
    if (i.revoked_at) return { label: isAr ? "ملغاة" : "Revoked", cls: "text-ink-muted" };
    if (i.accepted_at) return { label: isAr ? "مستخدمة" : "Used", cls: "text-emerald-400" };
    if (i.expires_at && new Date(i.expires_at) <= new Date()) return { label: isAr ? "منتهية" : "Expired", cls: "text-amber-400" };
    return { label: isAr ? "في الانتظار" : "Pending", cls: "text-blue-400" };
  };

  return (
    <Modal open={open} onClose={onClose} title={isAr ? "دعوة زملائك" : "Invite your team"} size="lg">
      {!isAdmin ? (
        <p className="text-sm text-ink-3 py-6 text-center" data-testid="not-admin">
          {isAr
            ? "يمكن لمسؤولي المؤسسة فقط دعوة أعضاء جدد. اطلب من المسؤول إرسال دعوة."
            : "Only an organisation admin can invite people. Ask an admin to send an invitation."}
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-ink-muted leading-relaxed">
            {isAr
              ? "الدعوة هي الطريقة الوحيدة للانضمام إلى مؤسستك. من يسجّل بدون دعوة ينشئ مساحة عمل جديدة خاصة به."
              : "An invitation is the only way into your organisation. Anyone who signs up without one creates a separate workspace of their own."}
          </p>

          {fresh ? (
            <FreshInvite invite={fresh} onDone={() => setFresh(null)} isAr={isAr} />
          ) : (
            <div className="rounded-xl p-4" style={glass(0.4)}>
              <div className="text-sm text-ink font-medium mb-3">{isAr ? "دعوة جديدة" : "New invitation"}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">{isAr ? "البريد الإلكتروني (اختياري)" : "Email (optional)"}</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder={isAr ? "colleague@company.com" : "colleague@company.com"} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="invite-email" />
                  <div className="text-[10px] text-ink-faint mt-1">
                    {isAr ? "إذا حُدّد، لا يمكن استخدام الدعوة إلا بهذا البريد." : "If set, only that address can redeem it."}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">{isAr ? "الدور" : "Role"}</label>
                  <select value={role} onChange={e => setRole(e.target.value)} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="invite-role">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <div className="text-[10px] text-ink-faint mt-1">{ROLES.find(r => r.value === role)?.hint}</div>
                </div>
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">{isAr ? "تنتهي خلال" : "Expires in"}</label>
                  <select value={expiry} onChange={e => setExpiry(Number(e.target.value))} className={inputCls} style={{ padding: "10px 12px", fontSize: "13px" }} data-testid="invite-expiry">
                    {EXPIRY.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={create} disabled={creating} className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition hover:scale-[1.01]" style={{ background: GRAD_ACCENT, color: INK_ON_ACCENT }} data-testid="create-invite">
                    {creating ? (isAr ? "..." : "...") : (isAr ? "إنشاء دعوة" : "Create invitation")}
                  </button>
                </div>
              </div>
              {createError && <div className="text-xs text-red-400 mt-3" data-testid="create-error">{createError}</div>}
            </div>
          )}

          <div>
            <div className="text-sm text-ink font-medium mb-2">{isAr ? "الدعوات" : "Invitations"}</div>
            {loadError && <div className="text-xs text-red-400 mb-2" data-testid="load-error">{loadError}</div>}
            {loading ? (
              <div className="text-xs text-ink-faint py-6 text-center">{isAr ? "جاري التحميل..." : "Loading…"}</div>
            ) : invites.length === 0 ? (
              <div className="text-xs text-ink-faint py-6 text-center" data-testid="no-invites">
                {isAr ? "لا توجد دعوات بعد." : "No invitations yet."}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {invites.map(i => {
                  const st = statusOf(i);
                  const pending = !i.revoked_at && !i.accepted_at && (!i.expires_at || new Date(i.expires_at) > new Date());
                  return (
                    <div key={i.id} className="flex items-center gap-3 p-2.5 rounded-lg" style={glass(0.3)}>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-ink-2 truncate">
                          {i.email || (isAr ? "رابط مفتوح (أي بريد)" : "Open link (any email)")}
                        </div>
                        <div className="text-[10px] text-ink-faint mt-0.5">
                          {i.role}
                          {i.expires_at && ` · ${isAr ? "تنتهي" : "expires"} ${new Date(i.expires_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${st.cls}`}>{st.label}</span>
                      {pending && (
                        <button onClick={() => revoke(i.id)} disabled={revoking === i.id} className="text-[10px] text-ink-faint hover:text-red-400 transition px-2 py-1 rounded hover:bg-red-500/10 shrink-0 disabled:opacity-40" data-testid={`revoke-${i.id}`}>
                          {revoking === i.id ? "…" : (isAr ? "إلغاء" : "Revoke")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
