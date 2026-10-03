import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Only IO/module boundaries are injected; React is never replaced.
export function loadModule<T>(path: string, dependencies: Record<string, unknown>): T {
  const require = createRequire(import.meta.url);
  const exported = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports: exported, Date, FormData, console, require: (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === "server-only") return {};
    if (name.startsWith("@harness/core/")) return require(resolve("packages/core", name.slice("@harness/core/".length)));
    if (name.startsWith(".")) return require(resolve(path, "..", name));
    return require(name);
  } });
  return exported as T;
}
