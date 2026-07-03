// Tests for the manual-send fallback modal (admin Send tab): single vs bulk
// rendering, the copy → clipboard + toast path, open-WhatsApp → wa.me +
// onManualSent stamping, bulk row gray-out, and the invalid-phone / no-link
// degradations. t() echoes keys so assertions stay language-independent.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { WaSendFallbackModal } from "../../pages/portal/admin/WaSendFallbackModal.jsx";

const t = (k) => k;

// One fully-populated failure payload (what the send hooks attach as res.fallback).
const failure = (over = {}) => ({
  guestId: "g1",
  name: "أحمد",
  phone: "0501234567",
  message: "مرحبا يا أحمد",
  url: "https://invite.dawa.to/invite/abc123",
  error: "send_failed",
  type: "physical",
  groomUid: "groom-1",
  ...over,
});

const renderModal = (props = {}) => {
  const onClose = vi.fn();
  const onManualSent = vi.fn();
  const showToast = vi.fn();
  const utils = render(
    <WaSendFallbackModal
      open
      onClose={onClose}
      failures={[failure()]}
      onManualSent={onManualSent}
      t={t}
      lang="ar"
      showToast={showToast}
      {...props}
    />,
  );
  return { ...utils, onClose, onManualSent, showToast };
};

let writeText;

beforeEach(() => {
  // jsdom has no navigator.clipboard — install a spyable stub.
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  vi.spyOn(window, "open").mockReturnValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("<WaSendFallbackModal> — single failure", () => {
  it("renders the guest name, phone, and the joined message + url text", () => {
    renderModal();
    expect(screen.getByText("أحمد")).toBeInTheDocument();
    expect(screen.getByText("0501234567")).toBeInTheDocument();
    // Full text = [message, url].join("\n\n") — identical to the server's send body.
    expect(screen.getByTestId("wa-fallback-text").textContent).toBe(
      "مرحبا يا أحمد\n\nhttps://invite.dawa.to/invite/abc123",
    );
  });

  it("copy writes body+\\n\\n+url to the clipboard and toasts", async () => {
    const { showToast } = renderModal();
    fireEvent.click(screen.getByTestId("wa-fallback-copy"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("مرحبا يا أحمد\n\nhttps://invite.dawa.to/invite/abc123");
      expect(showToast).toHaveBeenCalledWith("wa_fallback_copied");
    });
  });

  it("open opens a wa.me link in a new tab and fires onManualSent", () => {
    const { onManualSent } = renderModal();
    fireEvent.click(screen.getByTestId("wa-fallback-open"));
    expect(window.open).toHaveBeenCalledTimes(1);
    const [url, target, features] = window.open.mock.calls[0];
    expect(url).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
    // Pin the PAYLOAD, not just the prefix — the encoded text must carry the
    // full body + "\n\n" + invite link (a buildWaLink regression dropping the
    // url would otherwise pass a prefix-only assertion).
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(
      "مرحبا يا أحمد\n\nhttps://invite.dawa.to/invite/abc123",
    );
    expect(target).toBe("_blank");
    expect(features).toBe("noopener");
    expect(onManualSent).toHaveBeenCalledWith(expect.objectContaining({ guestId: "g1", type: "physical" }));
  });

  it("does NOT check the row off (and toasts an error) when the clipboard write fails", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { showToast } = renderModal({ failures: [failure(), failure({ guestId: "g2", name: "سامي" })] });
    fireEvent.click(screen.getByTestId("wa-row-copy-g1"));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("wa_fallback_copy_failed");
    });
    expect(screen.getByTestId("wa-row-g1").style.opacity).toBe("1");
    expect(screen.queryByText("wa_fallback_done")).toBeNull();
  });

  it("localizes popup_blocked / send_failed slugs instead of rendering them raw", () => {
    renderModal({
      failures: [
        failure({ guestId: "g1", message: "", url: "", error: "popup_blocked" }),
        failure({ guestId: "g2", name: "سامي", message: "", url: "", error: "Recipient not in allowed list" }),
      ],
    });
    // popup_blocked → dedicated key; unknown raw Meta text → generic wa_send_failed.
    expect(screen.getByText(/wa_error_popup_blocked/)).toBeInTheDocument();
    expect(screen.getByText(/wa_send_failed/)).toBeInTheDocument();
    expect(screen.queryByText(/Recipient not in allowed list/)).toBeNull();
  });

  it("hides the open button and shows the no-phone hint when the phone is unusable", () => {
    renderModal({ failures: [failure({ phone: "" })] });
    expect(screen.queryByTestId("wa-fallback-open")).toBeNull();
    expect(screen.getByText("wa_fallback_no_phone")).toBeInTheDocument();
    // Copy stays available — the admin can still paste the text elsewhere.
    expect(screen.getByTestId("wa-fallback-copy")).toBeInTheDocument();
  });

  it("renders the body only (no joiner) for a no-design send with url:\"\"", () => {
    renderModal({ failures: [failure({ url: "" })] });
    expect(screen.getByTestId("wa-fallback-text").textContent).toBe("مرحبا يا أحمد");
  });
});

describe("<WaSendFallbackModal> — bulk failures", () => {
  const bulk = [failure(), failure({ guestId: "g2", name: "سامي", phone: "0529876543" })];

  it("lists every failed guest with per-row actions", () => {
    renderModal({ failures: bulk });
    expect(screen.getByText("wa_bulk_failed_hint")).toBeInTheDocument();
    expect(screen.getByTestId("wa-row-g1")).toBeInTheDocument();
    expect(screen.getByTestId("wa-row-g2")).toBeInTheDocument();
    expect(screen.getByTestId("wa-row-open-g2")).toBeInTheDocument();
  });

  it("grays a row out after its copy button is used (copy does NOT stamp manual)", async () => {
    const { onManualSent } = renderModal({ failures: bulk });
    fireEvent.click(screen.getByTestId("wa-row-copy-g1"));
    await waitFor(() => {
      expect(screen.getByTestId("wa-row-g1").style.opacity).toBe("0.45");
      expect(screen.getByText("wa_fallback_done")).toBeInTheDocument();
    });
    // The untouched row keeps full opacity; copy alone never fires onManualSent.
    expect(screen.getByTestId("wa-row-g2").style.opacity).toBe("1");
    expect(onManualSent).not.toHaveBeenCalled();
  });

  it("renders a button-less row (name + phone + error only) when the failure has no payload", () => {
    renderModal({
      failures: [failure(), { guestId: "g3", name: "ليلى", phone: "0501112222", error: "send_failed" }],
    });
    expect(screen.getByText("ليلى")).toBeInTheDocument();
    expect(screen.queryByTestId("wa-row-copy-g3")).toBeNull();
    expect(screen.queryByTestId("wa-row-open-g3")).toBeNull();
  });
});
