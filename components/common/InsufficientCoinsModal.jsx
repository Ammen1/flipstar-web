import { AlertCircle, X, Wallet } from "lucide-react";

const GOLD = "linear-gradient(to bottom, #8fc441 0%, #b8d97a 50%, #6fa32e 100%)";

export function InsufficientCoinsModal({ visible, onClose, onBuyCoins }) {
  if (!visible) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#111", borderRadius: 18, width: "100%", maxWidth: 320, padding: 24, alignItems: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#b8d97a" }}>Insufficient Coins</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#b8d97a" }}><X size={22} /></button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <AlertCircle size={48} color="#b8d97a" />
        </div>

        <div style={{ fontSize: 14, color: "#aaa", textAlign: "center", marginBottom: 24, lineHeight: "20px" }}>
          You have insufficient coins to perform this action.
        </div>

        <button onClick={onBuyCoins} style={{ width: "100%", padding: "14px", background: GOLD, border: "none", borderRadius: 10, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}>
          Buy Coins
        </button>

        <button onClick={onClose} style={{ width: "100%", padding: "14px", background: "#262626", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
