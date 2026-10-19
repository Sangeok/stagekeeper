import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Metadata } from "next";
import ts from "typescript";

import * as landing from "@/fsd/pages/landing";
import { AFTER_SIGN_IN } from "@/server/auth/config.base";

function loadPage({ signedIn, siteHref = "https://docs.example.test/" }: { signedIn: boolean; siteHref?: string }) {
  const signIns: Array<{ provider: string; redirectTo: string }> = [];
  const require = createRequire(import.meta.url);
  const imports: Record<string, unknown> = {
    "@/fsd/pages/landing": landing,
    "@/server/auth/index": {
      auth: async () => signedIn ? { user: { id: "fixture" } } : null,
      signIn: async (provider: string, options: { redirectTo: string }) => { signIns.push({ provider, ...options }); },
    },
    "@/server/auth/config.base": { AFTER_SIGN_IN },
    "@/server/public-url": { siteUrl: () => ({ href: siteHref }) },
  };
  const exported: { default?: () => Promise<ReactElement<{ children: ReactNode }>>; metadata?: Metadata } = {};
  const code = ts.transpileModule(readFileSync(new URL("./page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports: exported, require: (name: string) => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  assert.ok(exported.default);
  return { page: exported.default, metadata: exported.metadata, signIns };
}

it("preserves the landing session and GitHub action while exposing valid WebSite JSON", async () => {
  for (const signedIn of [false, true]) {
    const fixture = loadPage({ signedIn });
    const element = await fixture.page();
    const children = Children.toArray(element.props.children);
    const screen = children.find((child) => isValidElement<ComponentProps<typeof landing.LandingPage>>(child) && child.type === landing.LandingPage);
    assert.ok(isValidElement<ComponentProps<typeof landing.LandingPage>>(screen));
    assert.equal(screen.props.signedIn, signedIn);
    await screen.props.signInAction();
    assert.deepEqual(fixture.signIns, [{ provider: "github", redirectTo: AFTER_SIGN_IN }]);
    const html = renderToStaticMarkup(element);
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(json);
    assert.deepEqual(JSON.parse(json), { "@context": "https://schema.org", "@type": "WebSite", name: "Stagekeeper", url: "https://docs.example.test/" });
    assert.equal(fixture.metadata?.title, landing.LANDING_TITLE);
    assert.equal(fixture.metadata?.description, landing.LANDING_DESCRIPTION);
  }
});

it("escapes an HTML-sensitive structured-data value without changing the parsed value", async () => {
  const siteHref = "https://docs.example.test/</script><script>fixture</script>";
  const fixture = loadPage({ signedIn: false, siteHref });
  const html = renderToStaticMarkup(await fixture.page());
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json);
  assert.ok(!json.includes("<"));
  assert.equal(JSON.parse(json).url, siteHref);
});
