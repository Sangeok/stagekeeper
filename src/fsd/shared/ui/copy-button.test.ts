import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { it } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type ButtonElement = { props: { onClick(): Promise<void>; disabled: boolean; children: string } };
function deferred() {
  let resolve!: () => void; let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

// 컴포넌트의 실제 hook 상태/handler를 실행한다. clipboard와 renderer만 모형이며 로직을 재구현하지 않는다.
function copyFixture() {
  const slots: unknown[] = []; let cursor = 0;
  const writes: { text: string; done: ReturnType<typeof deferred> }[] = []; const logs: unknown[][] = [];
  const hooks = {
    useState: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value: unknown) => { slots[index] = value; }]; },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  };
  const require = createRequire(import.meta.url);
  const exported = {} as { CopyButton(props: { text: string }): ButtonElement };
  const code = ts.transpileModule(readFileSync("src/fsd/shared/ui/copy-button.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports: exported, console: { error: (...args: unknown[]) => logs.push(args) },
    navigator: { clipboard: { writeText: (text: string) => { const done = deferred(); writes.push({ text, done }); return done.promise; } } },
    require: (name: string) => name === "react" ? hooks : name === "./button" ? { Button: "button" } : require(name) });
  return { writes, logs, render: (text: string) => { cursor = 0; return exported.CopyButton({ text }).props; },
    cleanup: () => { for (const write of writes) write.done.resolve(); } };
}

it("ties success to the clicked text across prop changes and serializes rapid/late writes", async () => {
  const f = copyFixture();
  try {
    const first = f.render("token-A"); const pending = first.onClick();
    await first.onClick(); assert.equal(f.writes.length, 1, "ref blocks before pending is rendered");
    assert.equal(f.render("token-B").disabled, true);
    assert.equal(f.render("token-B").children, "Copy");
    f.writes[0].done.resolve(); await pending;
    assert.equal(f.render("token-A").children, "Copied");
    assert.equal(f.render("token-B").children, "Copy");
    const second = f.render("token-B").onClick(); assert.equal(f.writes[1].text, "token-B");
    f.writes[1].done.resolve(); await second;
    assert.equal(f.render("token-B").children, "Copied"); assert.equal(f.render("token-B").disabled, false);
  } finally { f.cleanup(); }
});

it("clears failed success, unlocks for retry and settles safely after the last render", async () => {
  const f = copyFixture();
  try {
    const failed = f.render("secret-value").onClick();
    f.writes[0].done.reject(new Error("permission denied")); await failed;
    assert.equal(f.render("secret-value").children, "Copy"); assert.equal(f.render("secret-value").disabled, false);
    assert.ok(!JSON.stringify(f.logs).includes("secret-value"));
    const retry = f.render("secret-value").onClick();
    // 이후 renderer가 없는 경우에도 완료를 종료한다. 실제 unmount/DOM 인수는 브라우저에서 한다.
    f.writes[1].done.resolve(); await retry;
    assert.equal(f.writes.length, 2);
  } finally { f.cleanup(); }
});
