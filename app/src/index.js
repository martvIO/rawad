// Custom app entry (package.json "main").
//
// Wire the @dawa/core adapters BEFORE expo-router boots, so any route or service
// module that reads env/storage at import time sees the populated adapters.
// ESM evaluates imports top-down, so initAdapters' side effects run first.
import "./initAdapters.js";
import "expo-router/entry";
