// Wire the @dawa/core platform adapters for the NATIVE (Expo) build.
//
// Imported first from src/index.js — before expo-router boots — so shared
// modules that read env at module-evaluation time (config, logger) see the
// populated env map, exactly like the web build's initAdapters.js.
import { setEnv } from "@dawa/core/adapters/env.js";
import { setStorage } from "@dawa/core/adapters/storage.js";
import { setBinaryUpload } from "@dawa/core/adapters/upload.js";
import { setPasswordEncryptor } from "@dawa/core/adapters/crypto.js";
import { nativeEnv } from "./adapters/native/env.js";
import { nativeStorage } from "./adapters/native/storage.js";
import { nativeBinaryUpload } from "./adapters/native/upload.js";
import { nativeRsaOaepEncrypt } from "./adapters/native/passwordCrypto.js";

setEnv(nativeEnv);
setStorage(nativeStorage);
setBinaryUpload(nativeBinaryUpload);
setPasswordEncryptor(nativeRsaOaepEncrypt);
