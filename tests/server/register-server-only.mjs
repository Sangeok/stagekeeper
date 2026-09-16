import { createRequire, Module } from "node:module";

// Only this marker is replaced, inside an explicitly bootstrapped test process.
const require = createRequire(import.meta.url);
const filename = require.resolve("server-only");
const marker = new Module(filename);
marker.filename = filename;
marker.loaded = true;
marker.exports = {};
require.cache[filename] = marker;
