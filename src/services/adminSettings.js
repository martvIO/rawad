// Admin-tweakable settings (WhatsApp message body + form link) live at /adminSettings.
import { ref, onValue, update } from "firebase/database";
import { db } from "../firebase.js";

export function subscribeSettings(cb) {
  return onValue(ref(db, "adminSettings"), (snap) => {
    cb(snap.val() ?? {});
  });
}

export async function saveSettings(patch) {
  return update(ref(db, "adminSettings"), patch);
}
