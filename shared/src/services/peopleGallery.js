// Public People-gallery service (OTP-gated). Backs /g/:groomUsername.
//   POST /digital/gallery/:user/request-otp   { phoneE164, recaptchaToken } → { sessionInfo }
//   POST /digital/gallery/:user/verify-otp     { sessionInfo, code } → { galleryToken, expiresAt }
//   GET  /digital/gallery/:user?galleryToken=…                 → { config, people }
//   GET  /digital/gallery/:user/person/:id?galleryToken=…      → { photos }
//   …/person/:id/zip?galleryToken=…  (download)

import { api, buildApiUrl } from "../utils/apiClient.js";

const enc = encodeURIComponent;

export async function requestGalleryOtp(username, phoneE164, recaptchaToken) {
  return api.post(`/digital/gallery/${enc(username)}/request-otp`, { phoneE164, recaptchaToken }, { skipAuth: true });
}

export async function verifyGalleryOtp(username, sessionInfo, code, consent) {
  // The server rejects the grant without affirmative biometric consent.
  return api.post(
    `/digital/gallery/${enc(username)}/verify-otp`,
    { sessionInfo, code, consent: consent === true },
    { skipAuth: true },
  );
}

export async function fetchGalleryPeople(username, galleryToken) {
  return api.get(`/digital/gallery/${enc(username)}?galleryToken=${enc(galleryToken)}`, { skipAuth: true });
}

export async function fetchPersonPhotos(username, clusterId, galleryToken) {
  return api.get(
    `/digital/gallery/${enc(username)}/person/${enc(clusterId)}?galleryToken=${enc(galleryToken)}`,
    { skipAuth: true },
  );
}

export function personZipUrl(username, clusterId, galleryToken) {
  return buildApiUrl(
    `/digital/gallery/${enc(username)}/person/${enc(clusterId)}/zip?galleryToken=${enc(galleryToken)}`,
  );
}
