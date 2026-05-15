// CJS wrapper so firebase-tools' pkg-bundled node can run the vite build.
// pkg's node cannot require() ES modules but CAN await import() them.
const path = require("path");
const { pathToFileURL } = require("url");

// Windows: import() requires a file:// URL for absolute paths, not a raw C:\ path.
const vitePkg = pathToFileURL(
  path.join(__dirname, "..", "node_modules", "vite", "dist", "node", "index.js")
).href;

(async () => {
  const { build } = await import(vitePkg);
  await build();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
