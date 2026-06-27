// RTDB onCreate trigger: pre-render + cache the WhatsApp/OG preview image the
// moment an invite link is minted, so the static image at og-cache/{token}.jpg
// exists BEFORE the groom ever shares the link. This is what makes the FIRST
// WhatsApp share show the large preview: the /og/ handler then just streams the
// ready JPEG instead of cold-rendering it (a cold render exceeded WhatsApp's
// link-preview fetch timeout, which is why a freshly-minted link showed no image
// while an already-shared one did — see digitalOgImage.ts).
//
// Lives in its OWN function (not the `api` Express function) so the heavy
// @napi-rs/canvas (Skia) runtime never inflates the API's cold start — the same
// isolation pattern the face engine uses (see index.ts).
import { onValueCreated } from "firebase-functions/v2/database";
import { renderAndCacheOgForToken } from "./digitalOgImage";
import { TOKEN_HEX_RE } from "./constants/tokens";

export const cacheInviteOgImage = onValueCreated(
  {
    ref: "/inviteTokens/{token}",
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (event) => {
    const token = event.params.token;
    if (!token || !TOKEN_HEX_RE.test(token)) return;
    try {
      await renderAndCacheOgForToken(token);
    } catch (e) {
      // Best-effort: a render hiccup must never affect minting. The /og/ handler
      // re-renders + caches on the first scrape as a fallback.
      console.error("[cacheInviteOgImage] failed", token, e);
    }
  },
);
