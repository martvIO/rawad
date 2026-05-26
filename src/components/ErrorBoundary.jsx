// Catches any unhandled render or lifecycle exception below it and renders a
// bilingual recovery screen instead of an unstyled white page. Error boundaries
// must be class components — there is no hook equivalent.
import { Component } from "react";
import { C } from "../styles/theme.js";
import { logErr } from "../utils/logger.js";

const wrapStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  gap: 18,
  padding: 24,
  background: C.bg,
  color: C.goldLight,
  fontFamily: "sans-serif",
  textAlign: "center",
};

const lineStyle = { fontSize: 18, margin: 0, color: C.goldLight };

const subStyle = { fontSize: 13, margin: 0, color: C.goldDim };

const buttonStyle = {
  marginTop: 8,
  padding: "10px 28px",
  background: C.gold,
  color: C.bg,
  border: "none",
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err, info) {
    logErr("ErrorBoundary", err, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={wrapStyle} dir="rtl">
        <p style={lineStyle}>حدث خطأ غير متوقع — يرجى إعادة تحميل الصفحة</p>
        <p style={lineStyle}>אירעה שגיאה בלתי צפויה — אנא טען מחדש את הדף</p>
        <p style={subStyle}>Dawa · إعادة المحاولة آمنة / טעינה מחדש בטוחה</p>
        <button type="button" style={buttonStyle} onClick={this.handleReload}>
          إعادة تحميل / טעינה מחדש
        </button>
      </div>
    );
  }
}
