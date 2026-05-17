import { GOLD } from "../constants";

const SECTIONS = [
  { label: { en: "Core", ar: "الأساسية" }, keys: ["dashboard", "staircase", "ai", "alerts"] },
  { label: { en: "Execution", ar: "التنفيذ" }, keys: ["actionplans", "manifest", "sources"] },
  { label: { en: "Library", ar: "المكتبة" }, keys: ["knowledge", "tools", "notes"] },
];

const SidebarItem = ({ k, n, active, collapsed, isAr, onSelect }) => (
  <button
    onClick={() => onSelect(k)}
    data-tutorial={n.tutorial}
    title={collapsed ? n.label : undefined}
    className="group relative w-full flex items-center transition-colors"
    style={{
      gap: collapsed ? 0 : 12,
      justifyContent: collapsed ? "center" : (isAr ? "flex-end" : "flex-start"),
      padding: collapsed ? "11px 0" : "10px 14px",
      borderLeft: isAr ? "none" : `4px solid ${active ? GOLD : "transparent"}`,
      borderRight: isAr ? `4px solid ${active ? GOLD : "transparent"}` : "none",
      background: active ? "rgba(184, 144, 74, 0.1)" : "transparent",
      color: active ? GOLD : "#64748b",
    }}
    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "#e2e8f0"; } }}
    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; } }}
  >
    <span className="relative shrink-0" style={{ fontSize: 18, lineHeight: 1 }}>
      {n.icon}
      {collapsed && n.badge > 0 && (
        <span className="absolute -top-1.5 -right-2 px-1 rounded-full text-[8px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40">{n.badge}</span>
      )}
    </span>
    {!collapsed && (
      <>
        <span className="text-xs font-medium whitespace-nowrap flex-1" style={{ textAlign: isAr ? "right" : "left" }}>{n.label}</span>
        {n.badge > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">{n.badge}</span>
        )}
      </>
    )}
    {collapsed && (
      <span
        className="pointer-events-none absolute z-50 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          [isAr ? "right" : "left"]: "calc(100% + 8px)",
          top: "50%",
          transform: "translateY(-50%)",
          background: "rgba(10, 22, 40, 0.97)",
          border: `1px solid ${GOLD}40`,
          color: "#e2e8f0",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        }}
      >{n.label}{n.badge > 0 ? ` (${n.badge})` : ""}</span>
    )}
  </button>
);

export const Sidebar = ({ navItems, view, onSelect, collapsed, onToggleCollapse, isAr, mobileOpen, onMobileClose }) => {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onMobileClose} />
      )}
      <aside
        className={`z-50 flex-col shrink-0 transition-all duration-200 md:static md:flex ${
          mobileOpen ? "flex fixed inset-y-0" : "hidden md:flex"
        } ${isAr ? "right-0" : "left-0"}`}
        style={{
          width: collapsed ? 56 : 200,
          background: "rgba(10, 22, 40, 0.95)",
          [isAr ? "borderLeft" : "borderRight"]: "1px solid rgba(30, 58, 95, 0.5)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          className="flex items-center shrink-0"
          style={{ justifyContent: collapsed ? "center" : "flex-end", padding: collapsed ? "10px 0" : "10px 12px" }}
        >
          <button
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded-lg text-gray-500 hover:text-amber-400 hover:bg-amber-500/10 transition text-sm"
          >☰</button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {SECTIONS.map((section, si) => (
            <div
              key={si}
              className={si > 0 ? "mt-2 pt-2" : ""}
              style={si > 0 ? { borderTop: "1px solid rgba(30, 58, 95, 0.5)" } : undefined}
            >
              {!collapsed && (
                <div
                  className="px-4 pb-1.5 pt-1"
                  style={{ color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 2, textAlign: isAr ? "right" : "left" }}
                >{isAr ? section.label.ar : section.label.en}</div>
              )}
              {section.keys.map((k) => {
                const n = navItems[k];
                if (!n) return null;
                return (
                  <SidebarItem
                    key={k}
                    k={k}
                    n={n}
                    active={view === k}
                    collapsed={collapsed}
                    isAr={isAr}
                    onSelect={onSelect}
                  />
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className="shrink-0 text-center py-3"
          style={{ borderTop: "1px solid rgba(30, 58, 95, 0.5)", color: "#475569", fontSize: 9, letterSpacing: 1 }}
        >
          {collapsed ? "&I" : "v3.7.0 · Human IS the Loop"}
        </div>
      </aside>
    </>
  );
};
