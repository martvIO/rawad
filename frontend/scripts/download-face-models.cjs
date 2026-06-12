// Downloads face-api.js model files into /public/models so the face-matching
// page can load them from the same origin (no CDN, no CSP changes), and into
// /functions/models for the server-side photo face-indexing trigger.
//
// Browser models (/public/models — what /d/:user/:token/photos needs):
//   tiny_face_detector_model        — fast face detection
//   face_landmark_68_model          — 68-point landmarks for liveness (head yaw)
//   face_recognition_model          — 128-D descriptors for matching
//
// Server models (/functions/models — what the indexPhotographerFile trigger needs):
//   ssd_mobilenetv1_model           — higher-recall detector for group shots
//   face_landmark_68_model          — landmarks (descriptor alignment)
//   face_recognition_model          — MUST be byte-identical to the browser copy
//                                     so client/server descriptors stay comparable
//
// Usage:  node scripts/download-face-models.cjs
//
// Idempotent: skips files that already exist on disk.
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const BASE       = "https://justadudewhohacks.github.io/face-api.js/models/";
const OUT        = path.join(__dirname, "..", "public", "models");
const SERVER_OUT = path.join(__dirname, "..", "..", "backend", "functions", "models");

const FILES = [
  // tiny face detector
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model-shard1",
  // 68-point landmark net
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  // face recognition (128-D descriptor)
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];

// Server set: the shared nets are COPIED from public/models (same bytes); only
// the SSD MobileNet detector is downloaded (the browser doesn't use it).
const SERVER_DOWNLOADS = [
  "ssd_mobilenetv1_model-weights_manifest.json",
  "ssd_mobilenetv1_model-shard1",
  "ssd_mobilenetv1_model-shard2",
];
const SERVER_COPIES = [
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model-shard1",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model-shard1",
  "face_recognition_model-shard2",
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  for (const name of FILES) {
    const dest = path.join(OUT, name);
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
  console.log("All face-api models present in public/models/.\n");

  // ── Server models for functions/models ───────────────────────────────────
  if (!fs.existsSync(SERVER_OUT)) fs.mkdirSync(SERVER_OUT, { recursive: true });
  for (const name of SERVER_DOWNLOADS) {
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
  for (const name of SERVER_COPIES) {
    const src  = path.join(OUT, name);
    const dest = path.join(SERVER_OUT, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) {
      console.log(`✓ ${name} (already copied)`);
      continue;
    }
    fs.copyFileSync(src, dest);
    console.log(`⇒ ${name} copied from public/models (${fs.statSync(dest).size.toLocaleString()} bytes)`);
  }
  console.log("\nAll server face models present in functions/models/.");
})();
