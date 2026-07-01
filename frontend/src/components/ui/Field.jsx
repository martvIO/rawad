// Field / Textarea — standardize the label + input + hint/error trio that is
// currently hand-rolled inline across the app. Wraps the GlobalStyle
// `.field-label`, `.input-field` (+ `.error`/`.success` state classes),
// `.field-hint` and `.field-error` classes, and auto-wires accessibility
// (`htmlFor`, `aria-invalid`, `aria-describedby`). The 16px `.input-field`
// font-size (which prevents iOS Safari focus auto-zoom) is preserved.
//
// Copy is caller-supplied so it flows through i18n `t(key)` — never bake strings
// in here. See frontend/src/styles/GlobalStyle.jsx.

import { useId } from "react";

function stateClass(error, success, className) {
  const state = error ? " error" : success ? " success" : "";
  return `input-field${state}${className ? ` ${className}` : ""}`;
}

function HelpText({ error, hint, id }) {
  if (error) return <div className="field-error" id={id}>{error}</div>;
  if (hint) return <div className="field-hint" id={id}>{hint}</div>;
  return null;
}

export function Field({
  label,
  hint,
  error,
  success = false,
  id,
  className = "",
  containerStyle,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const descId = error || hint ? `${inputId}-desc` : undefined;
  return (
    <div style={containerStyle}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={stateClass(error, success, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        {...rest}
      />
      <HelpText error={error} hint={hint} id={descId} />
    </div>
  );
}

export function Textarea({
  label,
  hint,
  error,
  success = false,
  id,
  rows = 4,
  className = "",
  containerStyle,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const descId = error || hint ? `${inputId}-desc` : undefined;
  return (
    <div style={containerStyle}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={rows}
        className={stateClass(error, success, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={descId}
        {...rest}
      />
      <HelpText error={error} hint={hint} id={descId} />
    </div>
  );
}
