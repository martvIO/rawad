// Native env map for @dawa/core's config/index.js. Maps the app.config `extra`
// block (and any EXPO_PUBLIC_* override) to the VITE_* keys the shared config
// reads. All values are available synchronously at module load.
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

export const nativeEnv = {
  VITE_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL || extra.apiBaseUrl,
  VITE_SSE_BASE_URL: process.env.EXPO_PUBLIC_SSE_BASE_URL || extra.sseBaseUrl,
  VITE_INVITE_BASE_URL: process.env.EXPO_PUBLIC_INVITE_BASE_URL || extra.inviteBaseUrl,
  VITE_CONTACT_WHATSAPP: extra.contactWhatsapp,
  DEV: typeof __DEV__ !== "undefined" ? __DEV__ : false,
};
