// Metro config for the Dawa groom app.
//
// The app shares its business logic with the web frontend via @dawa/core, which lives
// at ../shared/src (NOT an npm package, NOT linked into node_modules). Two things make
// Metro able to bundle that out-of-app source under Expo SDK 56 (Metro 0.84):
//
// 1. pnpm-workspace.yaml at the REPO ROOT. Expo's getMetroServerRoot() reads it (via
//    resolve-workspace-root) and resolves the Metro "server root" to the repo root — the
//    common ancestor of app/ and shared/ — and adds app/ + shared/ to watchFolders. This
//    is the standard Expo monorepo wiring. WITHOUT it the server root collapses to app/
//    and Metro refuses to bundle the sibling shared/ tree ("Failed to get the SHA-1 for
//    ...shared... — the file is not watched"). npm ignores pnpm-workspace.yaml entirely,
//    so it does not affect installs or the Firebase deploy; only Expo's workspace
//    detection reads it.
// 2. The resolveRequest below, which maps the bare "@dawa/core" specifier (and shared's
//    own relative imports) to absolute source paths. shared/package.json ships an
//    "exports" map that does not line up with a shared/src-targeted alias, so a plain
//    extraNodeModules alias fails; returning a direct sourceFile path sidesteps that.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname; // rawad/app
const repoRoot = path.resolve(projectRoot, ".."); // rawad
const sharedSrc = path.resolve(repoRoot, "shared", "src"); // @dawa/core source root

const config = getDefaultConfig(projectRoot);

// Pin react/react-native to THIS app's single copy — shared/ imports them by bare name
// from outside app/, and a duplicate React would break hooks. Mirrors the web dedupe.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};

const SHARED_EXTS = [".js", ".jsx", ".ts", ".tsx", ".json", ".cjs", ".mjs"];
function resolveSharedFile(absBase) {
  if (fs.existsSync(absBase) && fs.statSync(absBase).isFile()) return absBase;
  for (const e of SHARED_EXTS) if (fs.existsSync(absBase + e)) return absBase + e;
  for (const e of SHARED_EXTS) {
    const idx = path.join(absBase, "index" + e);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Bare "@dawa/core" or "@dawa/core/<subpath>".
  if (moduleName === "@dawa/core" || moduleName.startsWith("@dawa/core/")) {
    const sub =
      moduleName === "@dawa/core" ? "index" : moduleName.slice("@dawa/core/".length);
    const fp = resolveSharedFile(path.join(sharedSrc, sub));
    if (fp) return { type: "sourceFile", filePath: fp };
  }
  // Relative imports made BY a shared file (e.g. "../utils/apiClient.js").
  const origin = context.originModulePath || "";
  if (
    (moduleName.startsWith("./") || moduleName.startsWith("../")) &&
    origin.startsWith(sharedSrc)
  ) {
    const fp = resolveSharedFile(path.resolve(path.dirname(origin), moduleName));
    if (fp) return { type: "sourceFile", filePath: fp };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
