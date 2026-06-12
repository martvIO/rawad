import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { C, FONT } from "./theme.js";

// Global page reset via injected styles (project convention is inline styles;
// this single style element only sets document-level defaults).
const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; }
  html, body, #root { height: 100%; margin: 0; }
  body {
    background: ${C.bg};
    color: ${C.text};
    font-family: ${FONT.sans};
    -webkit-font-smoothing: antialiased;
  }
  input, select, button, textarea { font-family: inherit; }
  table { border-collapse: collapse; }
  a { color: ${C.blue}; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
