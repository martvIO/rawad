// Single render-routing seam for the digital invitation. Every call site that
// used to import <DigitalInvitationView/> directly (the public guest page, the
// native-app WebView draft preview, the admin approval-grid preview modal, and
// the groom editor's live preview pane) now imports <TemplateRenderer/> instead
// — it picks the structural component tree from `design.templateId` and
// forwards every other prop unchanged, so none of those 4 call sites need to
// know the template registry exists.
import { getTemplate } from "./registry.js";

export function TemplateRenderer({ design, ...rest }) {
  const { Component } = getTemplate(design?.templateId);
  return <Component design={design} {...rest} />;
}
