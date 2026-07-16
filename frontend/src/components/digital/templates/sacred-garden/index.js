// Lazy entry for The Sacred Garden. registry.js does
// `lazy(() => import("./sacred-garden/index.js"))`, so the default export is the
// top-level view and this folder rides in the template's own split chunk.
export { SacredGardenView as default } from "./SacredGardenView.jsx";
