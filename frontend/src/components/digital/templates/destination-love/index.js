// Lazy entry for the Destination Love template. registry.js does
// `lazy(() => import("./destination-love/index.js"))`, so the default export is
// the top-level view component and everything under this folder (sections, the
// three.js scene) rides in this template's own split chunk.
export { DestinationLoveView as default } from "./DestinationLoveView.jsx";
