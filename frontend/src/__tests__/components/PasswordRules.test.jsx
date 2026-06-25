// RTL test for the password-rules checklist. Pure, prop-driven component — it
// reflects evaluatePassword() into a row per rule, lit green (✓) when passed.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PasswordRules } from "../../components/PasswordRules.jsx";

// Passthrough translator: render the raw i18n key so we can assert by it.
const t = (k) => k;

describe("<PasswordRules>", () => {
  it("renders one row per rule", () => {
    render(<PasswordRules password="" t={t} />);
    expect(screen.getByText("pwd_rule_min_length")).toBeInTheDocument();
    expect(screen.getByText("pwd_rule_uppercase")).toBeInTheDocument();
    expect(screen.getByText("pwd_rule_lowercase")).toBeInTheDocument();
    expect(screen.getByText("pwd_rule_number")).toBeInTheDocument();
  });

  it("marks every rule passed (✓) for a strong password", () => {
    const { container } = render(<PasswordRules password="Abcd1234" t={t} />);
    const markers = container.querySelectorAll("li > span[aria-hidden]");
    expect(markers).toHaveLength(4);
    markers.forEach((m) => expect(m.textContent).toBe("✓"));
  });

  it("marks failing rules (•) for a weak password", () => {
    // "abc": lowercase passes; min-length / uppercase / number fail.
    const { container } = render(<PasswordRules password="abc" t={t} />);
    const markers = [...container.querySelectorAll("li > span[aria-hidden]")].map(
      (m) => m.textContent,
    );
    expect(markers.filter((m) => m === "✓")).toHaveLength(1); // lowercase
    expect(markers.filter((m) => m === "•")).toHaveLength(3);
  });
});
