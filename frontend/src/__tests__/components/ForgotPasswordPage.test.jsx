// RTL test for the forgot-password page — drives the three-step state machine
// (request -> verify -> reset -> done) with usePortal() and the auth service
// mocked, so we assert transitions, the username+phone gate, and error mapping
// without a browser or the SMS backend. reCAPTCHA is inert here (no SITE_KEY),
// so the page takes its "verification not configured" path and sends "".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { portal } = vi.hoisted(() => ({ portal: { current: {} } }));
vi.mock("../../context/PortalContext.jsx", () => ({ usePortal: () => portal.current }));

const { svc } = vi.hoisted(() => ({
  svc: {
    sendPasswordResetCode: vi.fn(),
    confirmPasswordResetCode: vi.fn(),
    callResetPassword: vi.fn(),
  },
}));
vi.mock("../../services/auth.js", () => svc);

import { ForgotPasswordPage } from "../../pages/portal/ForgotPasswordPage.jsx";

const basePortal = (over = {}) => ({
  t: (k) => k, lang: "ar", setLang: vi.fn(), onBack: vi.fn(), ...over,
});

const renderPage = () => render(<ForgotPasswordPage />, { wrapper: MemoryRouter });
const IL_PHONE = "501234567"; // 9 digits, IL mobile -> +972501234567

const fillRequest = (user = "groom1", phone = IL_PHONE) => {
  fireEvent.change(screen.getByTestId("field-fr-user"), { target: { value: user } });
  fireEvent.change(document.getElementById("fr-phone"), { target: { value: phone } });
};

describe("<ForgotPasswordPage>", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    portal.current = basePortal();
  });

  it("starts on the request step and gates send until username + a complete phone", () => {
    renderPage();
    expect(screen.getByTestId("btn-fr-send")).toBeDisabled();
    fireEvent.change(screen.getByTestId("field-fr-user"), { target: { value: "groom1" } });
    expect(screen.getByTestId("btn-fr-send")).toBeDisabled(); // phone still empty
    fireEvent.change(document.getElementById("fr-phone"), { target: { value: IL_PHONE } });
    expect(screen.getByTestId("btn-fr-send")).not.toBeDisabled();
  });

  it("sends the code with (username, e164, recaptcha) and advances to the verify step", async () => {
    svc.sendPasswordResetCode.mockResolvedValueOnce({ sessionInfo: "sess-1" });
    renderPage();
    fillRequest();
    fireEvent.click(screen.getByTestId("btn-fr-send"));
    await screen.findByTestId("field-fr-code");
    expect(svc.sendPasswordResetCode).toHaveBeenCalledWith("groom1", "+972501234567", "");
    // masked tail of the phone is shown
    expect(screen.getByText(/567/)).toBeTruthy();
  });

  it("shows the generic mismatch message when the account/phone do not match", async () => {
    svc.sendPasswordResetCode.mockRejectedValueOnce({ status: 400, body: { error: "account_phone_mismatch" } });
    renderPage();
    fillRequest();
    fireEvent.click(screen.getByTestId("btn-fr-send"));
    const alert = await screen.findByTestId("alert-fr-error");
    expect(alert).toHaveTextContent("fr_err_mismatch");
    // stayed on the request step
    expect(screen.getByTestId("btn-fr-send")).toBeTruthy();
  });

  it("verifies the code, then resets the password and lands on the done step", async () => {
    svc.sendPasswordResetCode.mockResolvedValueOnce({ sessionInfo: "sess-1" });
    svc.confirmPasswordResetCode.mockResolvedValueOnce({ idToken: "phone-tok" });
    svc.callResetPassword.mockResolvedValueOnce({ ok: true });
    renderPage();

    fillRequest();
    fireEvent.click(screen.getByTestId("btn-fr-send"));

    const codeField = await screen.findByTestId("field-fr-code");
    fireEvent.change(codeField, { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("btn-fr-verify"));

    const pw1 = await screen.findByTestId("field-fr-pw1");
    // reset gated until strong + matching
    expect(screen.getByTestId("btn-fr-reset")).toBeDisabled();
    fireEvent.change(pw1, { target: { value: "Password1" } });
    fireEvent.change(screen.getByTestId("field-fr-pw2"), { target: { value: "Password1" } });
    expect(screen.getByTestId("btn-fr-reset")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("btn-fr-reset"));

    await screen.findByTestId("btn-fr-to-login");
    expect(svc.confirmPasswordResetCode).toHaveBeenCalledWith({ sessionInfo: "sess-1" }, "123456");
    expect(svc.callResetPassword).toHaveBeenCalledWith("Password1");
  });

  it("blocks reset when the two password fields differ", async () => {
    svc.sendPasswordResetCode.mockResolvedValueOnce({ sessionInfo: "sess-1" });
    svc.confirmPasswordResetCode.mockResolvedValueOnce({ idToken: "phone-tok" });
    renderPage();
    fillRequest();
    fireEvent.click(screen.getByTestId("btn-fr-send"));
    fireEvent.change(await screen.findByTestId("field-fr-code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("btn-fr-verify"));
    const pw1 = await screen.findByTestId("field-fr-pw1");
    fireEvent.change(pw1, { target: { value: "Password1" } });
    fireEvent.change(screen.getByTestId("field-fr-pw2"), { target: { value: "Password2" } });
    await waitFor(() => expect(screen.getByText("fr_mismatch_pw")).toBeTruthy());
    expect(screen.getByTestId("btn-fr-reset")).toBeDisabled();
  });
});
