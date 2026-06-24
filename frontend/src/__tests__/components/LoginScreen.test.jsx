// RTL test for the login screen — the error/rate-limit + loading states that the
// e2e suite only asserts loosely. usePortal() is mocked so we drive the state.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Hoisted so the (hoisted) vi.mock factory can reference it.
const { portal } = vi.hoisted(() => ({ portal: { current: {} } }));
vi.mock("../../context/PortalContext.jsx", () => ({
  usePortal: () => portal.current,
}));

import { LoginScreen } from "../../pages/portal/LoginScreen.jsx";

const basePortal = (over = {}) => ({
  onBack: vi.fn(), t: (k) => k, lang: "ar", setLang: vi.fn(),
  loginUser: "", setLoginUser: vi.fn(), loginPass: "", setLoginPass: vi.fn(),
  loginError: "", setLoginError: vi.fn(), handleLogin: vi.fn(), loginLoading: false,
  ...over,
});

describe("<LoginScreen>", () => {
  it("shows the error alert when loginError is set (e.g. rate-limit message)", () => {
    portal.current = basePortal({ loginError: "محاولات دخول كثيرة" });
    render(<LoginScreen />);
    expect(screen.getByTestId("alert-login-error")).toHaveTextContent("محاولات دخول كثيرة");
  });

  it("renders no error alert when loginError is empty", () => {
    portal.current = basePortal();
    render(<LoginScreen />);
    expect(screen.queryByTestId("alert-login-error")).toBeNull();
  });

  it("disables submit and shows a spinner while loading", () => {
    portal.current = basePortal({ loginLoading: true });
    const { container } = render(<LoginScreen />);
    expect(screen.getByTestId("btn-login-submit")).toBeDisabled();
    expect(container.querySelector(".spinner")).toBeTruthy();
  });

  it("calls handleLogin when submit is clicked", () => {
    const handleLogin = vi.fn();
    portal.current = basePortal({ handleLogin });
    render(<LoginScreen />);
    fireEvent.click(screen.getByTestId("btn-login-submit"));
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });

  it("typing the username updates state and clears any prior error", () => {
    const setLoginUser = vi.fn();
    const setLoginError = vi.fn();
    portal.current = basePortal({ setLoginUser, setLoginError });
    render(<LoginScreen />);
    fireEvent.change(screen.getByTestId("field-login-user"), { target: { value: "karim" } });
    expect(setLoginUser).toHaveBeenCalledWith("karim");
    expect(setLoginError).toHaveBeenCalledWith("");
  });
});
