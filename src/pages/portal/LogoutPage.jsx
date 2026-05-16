// Logout confirmation page at /portal/logout. Full-screen "Are you sure?"
// using the same copy as the in-portal modal. Cancel navigates back; confirm
// runs doLogout() (which calls Firebase signOut) and returns the user to /.
import { useNavigate } from "react-router-dom";
import { usePortal } from "../../context/PortalContext.jsx";

export function LogoutPage() {
  const navigate = useNavigate();
  const { t, doLogout } = usePortal();

  const onConfirm = async () => {
    await doLogout();
    navigate("/", { replace: true });
  };
  const onCancel = () => navigate(-1);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24, background: "#07070a",
    }}>
      <div style={{
        maxWidth: 420, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(212,80,58,.4)",
        borderRadius: 18, padding: 32, textAlign: "center",
        animation: "fadeUp .3s ease",
      }}>
        <div style={{ fontSize: 56, marginBottom: 14 }}>👋</div>
        <div style={{ color: "#d47a4b", fontWeight: 900, fontSize: 20, marginBottom: 12 }}>
          {t("logout_confirm_title")}
        </div>
        <div style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.8, marginBottom: 26 }}>
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
