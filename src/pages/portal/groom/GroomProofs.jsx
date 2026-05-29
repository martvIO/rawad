// Groom → Proofs: delivery proof photos for each delivered guest.
import { usePortal } from "../../../context/PortalContext.jsx";
import { C } from "../../../styles/theme.js";
import { Num } from "../../../components/Num.jsx";

export function GroomProofs() {
  const { t, myGuests, setViewingPhoto } = usePortal();
  return (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 14, fontSize: 15, fontWeight: 800, color: C.goldLight }}>{t("proofs_title")}</div>
            {myGuests.filter(g => g.proofImg).map(g => {
              const isImageData = typeof g.proofImg === "string"
                && (g.proofImg.startsWith("data:image") || /^https?:\/\//.test(g.proofImg));
              return (
                <div key={g.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      onClick={() => isImageData && setViewingPhoto(g.proofImg)}
                      style={{
                        width: 76, height: 76, borderRadius: 12, flexShrink: 0,
                        background: "linear-gradient(135deg,#1a1200,#2d1f00)",
                        border: "1px solid rgba(201,168,76,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", cursor: isImageData ? "zoom-in" : "default",
                        position: "relative",
                      }}
                      title={isImageData ? t("photo_view") : ""}
                    >
                      {isImageData ? (
                        <img src={g.proofImg} alt="proof"
                             style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      ) : (
                        <div style={{ fontSize: 30 }}>{g.proofImg}</div>
                      )}
                      {isImageData && (
                        <div style={{
                          position: "absolute", bottom: 2, right: 2,
                          background: "rgba(0,0,0,.7)", color: "#fff",
                          padding: "2px 5px", borderRadius: 4, fontSize: 10,
                        }}>🔍</div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: C.goldLight, fontSize: 14 }}>{g.name}</div>
                      {g.area && <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>📍 {g.area}</div>}
                      <div style={{ fontSize: 11, color: "#5a5040", marginTop: 3 }}>{t("proofs_distributor")} {g.deliveredBy} · {g.deliveredAt}</div>
                      {isImageData && (
                        <button onClick={() => setViewingPhoto(g.proofImg)} style={{
                          marginTop: 6, background: "rgba(201,168,76,.12)",
                          border: "1px solid rgba(201,168,76,.3)", color: C.gold,
                          padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                        }}>🔍 {t("photo_view")}</button>
                      )}
                    </div>
                    <span className="status-badge" style={{ background:"rgba(76,201,122,.15)", color:"#4cc97a" }}>✓</span>
                  </div>
                </div>
              );
            })}
            {myGuests.filter(g => !g.proofImg).length > 0 && (
              <div style={{ marginTop: 20, textAlign: "center", color: "#5a5040", fontSize: 12 }}>
                <Num>{myGuests.filter(g => !g.proofImg).length.toLocaleString("en")}</Num> {t("proofs_pending")}
              </div>
            )}
          </div>
  );
}
