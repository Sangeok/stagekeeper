import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { it } from "node:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

it("renders a neutral local fallback whose button retries without invoking an action", () => {
  const source = readFileSync(new URL("./reopen-actions-boundary.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const require = createRequire(import.meta.url);
  let fallback!: (props: object, info: { retry: () => void }) => ReactElement;
  const buttons: { onClick: () => void }[] = [];
  runInNewContext(code, { exports: {}, require: (name: string) => {
    if (name === "next/error") return { catchError: (render: typeof fallback) => { fallback = render; return () => null; } };
    if (name === "@/fsd/shared/ui/button") return { Button: (props: { onClick: () => void }) => { buttons.push(props); return createElement("button", props); } };
    if (name === "@/fsd/shared/ui/section-label") return { SectionLabel: (props: object) => createElement("h2", props) };
    return require(name);
  } });
  let retries = 0;
  const html = renderToStaticMarkup(fallback({}, { retry: () => { retries++; } }));
  assert.match(html, /role="alert"/);
  assert.ok(html.includes("This section couldn&#x27;t be loaded. Try again to check the latest item state."));
  assert.equal(buttons.length, 1);
  assert.equal(retries, 0);
  buttons[0].onClick();
  assert.equal(retries, 1);
});
