// Single render-routing seam for the digital invitation. Every call site that
// used to import <DigitalInvitationView/> directly (the public guest page, the
// native-app WebView draft preview, the admin approval-grid preview modal, and
// the groom editor's live preview pane) now imports <TemplateRenderer/> instead
// — it picks the structural component tree from `design.templateId` and
// forwards every other prop unchanged, so none of those 4 call sites need to
// know the template registry exists.
//
// Bespoke templates are code-split (React.lazy in registry.js), so this seam
// wraps the chosen component in <Suspense>. `classic` is eager (it's the
// fallback and must never itself suspend), so an all-classic app never mounts
// the fallback at all. The fallback (`TemplateLoadCover`) is deliberately NOT a
// spinner: on the public page it paints the design's own background colour plus
// the guest's name, so the brief chunk fetch reads as the sealed intro
// beginning — not a loading wall (the audit-flagged first-load stall).
import { Suspense } from "react";
import { getTemplate } from "./registry.js";
import { getDigitalTheme } from "../../../styles/digitalThemes.js";

function TemplateLoadCover({ design, mode, guestName }) {
  const theme = getDigitalTheme(design?.themeColor);
  const isPublic = mode === "public";
  return (
    <div
      aria-busy="true"
      style={{
        minHeight: isPublic ? "100vh" : 640,
        background: theme.bg,
        color: theme.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {isPublic && guestName ? (
        <div style={{ textAlign: "center", padding: "0 24px", opacity: 0.9 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: "clamp(24px,5vw,40px)",
              color: theme.text,
            }}
          >
            {guestName}
          </div>
        </div>
      ) : (
        // Editor / admin preview: a soft themed pulse so the pane doesn't
        // collapse to zero height while the template chunk loads.
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: theme.accent,
            animation: "dawa-tpl-load-pulse 1.1s ease-in-out infinite",
          }}
        />
      )}
      <style>{"@keyframes dawa-tpl-load-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}"}</style>
    </div>
  );
}

export function TemplateRenderer({ design, ...rest }) {
  const { Component } = getTemplate(design?.templateId);
  return (
    <Suspense fallback={<TemplateLoadCover design={design} mode={rest.mode} guestName={rest.guestName} />}>
      <Component design={design} {...rest} />
    </Suspense>
  );
}
