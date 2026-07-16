// Lazy entry for the Dolce Vita template. registry.js does
// `lazy(() => import("./dolce-vita/index.js"))`, so the default export is the
// top-level view component and everything under this folder (sections, the
// scratch-off canvas) rides in this template's own split chunk.
export { DolceVitaView as default } from "./DolceVitaView.jsx";
