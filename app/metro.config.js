// Metro config — resolves @dawa/core (the shared DOM-free core at ../shared/src)
// without an npm workspace, mirroring the web frontend's Vite alias.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname; // rawad/app
const repoRoot = path.resolve(projectRoot, ".."); // rawad
const sharedRoot = path.resolve(repoRoot, "shared"); // rawad/shared

const config = getDefaultConfig(projectRoot);

// Watch the shared package so Metro picks up @dawa/core source edits.
config.watchFolders = [sharedRoot];

// Resolve @dawa/core to shared/src, and pin react/react-native to THIS app's
// single copy — shared files import `react` by bare name from outside app/,
// so Metro must be told where to find it (and never duplicate it).
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@dawa/core": path.resolve(sharedRoot, "src"),
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
};
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

module.exports = config;
