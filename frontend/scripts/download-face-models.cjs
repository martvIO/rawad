// Downloads the face-api.js model files the SERVER needs into
// backend/functions/models, for the photo face-indexing trigger.
//
// These models are the legacy face-api engine, which faceIndex/config.ts still
// falls back to whenever AWS Rekognition credentials are absent (dev, emulator,
// or a prod deploy missing its creds) — so they remain load-bearing and ship
// with the functions deploy.
//
// Server models (backend/functions/models — what indexPhotographerFile needs):
//   ssd_mobilenetv1_model           — higher-recall detector for group shots
//   face_landmark_68_model          — landmarks (descriptor alignment)
//   face_recognition_model          — 128-D descriptors for matching
//
// History: this script also populated frontend/public/models for an in-browser
// matching path that no longer exists — the browser side moved to Rekognition +
// server-side indexing. Those 6.7 MB shipped in every hosting deploy while being
// fetched by nobody (Reports/WEB-QUALITY-2026-07-16.md, PERF-03), so the public
// copy was deleted and this script now downloads straight to the server dir.
//
// Usage:  node scripts/download-face-models.cjs
//
// Idempotent: skips files that already exist on disk.
const https = require("https");
const fs = require("fs");
const path = require("path");

const BASE = "https://justadudewhohacks.github.io/face-api.js/models/";
const SERVER_OUT = path.join(__dirname, "..", "..", "backend", "functions", "models");

const SERVER_FILES = [
  // higher-recall detector (server-only — the browser never ran this one)
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model-shard1",
  "ssd_mobilenetv1_model-shard2",
  // 68-point landmark net
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  // face recognition (128-D descriptor)
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        fs.unlink(dest, () => reject(err));
      });
  });
}

(async () => {
  fs.mkdirSync(SERVER_OUT, { recursive: true });
  for (const name of SERVER_FILES) {
    const dest = path.join(SERVER_OUT, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`✓ ${name} (already exists)`);
      continue;
    }
    process.stdout.write(`↓ ${name} ... `);
    try {
      await download(BASE + name, dest);
      console.log(`done (${fs.statSync(dest).size.toLocaleString()} bytes)`);
    } catch (err) {
      console.error(`FAILED — ${err.message}`);
      process.exit(1);
    }
  }
  console.log("\nAll server face models present in backend/functions/models/.");
})();
