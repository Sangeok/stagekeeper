import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type Resolver = (name: string) => unknown;

function evaluateModule<T>(path: string, globals: Record<string, unknown>, resolveDependency: Resolver): T {
  const exported = {};
  const code = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { Date, FormData, console, ...globals, exports: exported, require: resolveDependency });
  return exported as T;
}

export function loadModule<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const require = createRequire(import.meta.url);
  return evaluateModule<T>(path, globals, (name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "server-only") return {};
    if (name.startsWith("@harness/shared/")) return require(resolve("packages/shared", name.slice("@harness/shared/".length)));
    if (name.startsWith("@harness/app-core/")) return require(resolve("packages/app-core", name.slice("@harness/app-core/".length)));
    if (name.startsWith(".")) return require(resolve(path, "..", name));
    return require(name);
  });
}

export function loadIsolatedModule<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const require = createRequire(import.meta.url);
  return evaluateModule<T>(path, globals, (name) => {
    if (name in dependencies) return dependencies[name];
    if (name === "react/jsx-runtime") return require(name);
    throw new Error(`Unexpected dependency: ${name}`);
  });
}
