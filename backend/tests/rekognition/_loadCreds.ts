// Side-effect import for the real-Rekognition test suite: populate AWS creds
// from backend/functions/.env.local (or .env) — both gitignored — so
// `npm run test:rekognition` works without hand-exporting shell vars.
//
// Only fills keys that aren't already set in the environment, so an explicit
// shell export still wins. Loaded FIRST (before isRekognitionConfigured runs).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(HERE, "..", "..", "functions");

for (const name of [".env.local", ".env"]) {
  const file = path.join(FUNCTIONS_DIR, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
