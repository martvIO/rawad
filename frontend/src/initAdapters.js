// Wire the @dawa/core platform adapters for the WEB build.
//
// MUST be imported FIRST in main.jsx — before App and any service/config — so
// shared modules that read env at module-evaluation time (config/index.js,
// utils/logger.js) see the populated env map. ESM evaluates a module's imports
// depth-first in source order; this module imports only the adapter singletons
// and the web storage impl (none of which read env), so its side effects run
// before App's subtree (and thus before config/logger) is evaluated.
import { setEnv } from "@dawa/core/adapters/env.js";
import { setStorage } from "@dawa/core/adapters/storage.js";
import { webStorage } from "./adapters/webStorage.js";

setEnv(import.meta.env);
setStorage(webStorage);
