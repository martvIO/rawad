// Confirmation modal shown before logging the user out.

export function LogoutConfirm({ t, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1500, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 380, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(212,80,58,.4)",
        borderRadius: 18, padding: 28, animation: "slideUp .3s ease", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
        <div style={{ color: "#d47a4b", fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          {t("logout_confirm_title")}
        </div>
        <div style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.8, marginBottom: 22 }}>
          {t("logout_confirm_body")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} className="ghost-btn" style={{ flex: 1 }}>
            {t("logout_confirm_no")}
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "12px 18px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#d47a4b,#b03020)",
            color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: "inherit", cursor: "pointer",
          }}>
            {t("logout_confirm_yes")}
          </button>
        </div>
      </div>
    </div>
  );
}
