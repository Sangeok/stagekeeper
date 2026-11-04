import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { verifyProject } from "./verify-fsd-boundaries.mjs";

const temporaryProjects = [];

function project() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), "stagekeeper-fsd-"));
  temporaryProjects.push(root);
  return root;
}

function write(root, path, source = "export {};\n") {
  const target = join(root, ...path.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, "utf8");
}

function codes(root) {
  return verifyProject(root).map((problem) => problem.code);
}

afterEach(() => {
  for (const root of temporaryProjects.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("verifyProject", () => {
  it("accepts downward imports through a slice public API", () => {
    const root = project();
    write(root, "src/fsd/entities/board-item/index.ts");
    write(
      root,
      "src/fsd/features/review-gate/ui/gate-button.tsx",
      'import { BoardItem } from "@/fsd/entities/board-item";\nexport { BoardItem };\n',
    );
    write(root, "src/fsd/features/review-gate/index.ts");

    assert.deepEqual(verifyProject(root), []);
  });

  it("rejects upward layer imports", () => {
    const root = project();
    write(root, "src/fsd/entities/board-item/index.ts");
    write(root, "src/fsd/features/review-gate/index.ts");
    write(
      root,
      "src/fsd/entities/board-item/model/board-item.ts",
      'import { review } from "@/fsd/features/review-gate";\nexport { review };\n',
    );

    assert.ok(codes(root).includes("fsd/layers-import"));
  });

  it("rejects imports between slices on the same layer", () => {
    const root = project();
    write(root, "src/fsd/features/edit-backlog/index.ts");
    write(root, "src/fsd/features/review-gate/index.ts");
    write(
      root,
      "src/fsd/features/review-gate/model/gate.ts",
      'import { edit } from "@/fsd/features/edit-backlog";\nexport { edit };\n',
    );

    assert.ok(codes(root).includes("fsd/no-cross-slice-import"));
  });

  it("rejects another slice's internal file import", () => {
    const root = project();
    write(root, "src/fsd/entities/board-item/index.ts");
    write(root, "src/fsd/entities/board-item/model/board-item.ts");
    write(root, "src/fsd/features/review-gate/index.ts");
    write(
      root,
      "src/fsd/features/review-gate/model/gate.ts",
      'import { item } from "@/fsd/entities/board-item/model/board-item";\nexport { item };\n',
    );

    assert.ok(codes(root).includes("fsd/no-deep-import"));
  });

  it("accepts relative imports within one slice", () => {
    const root = project();
    write(root, "src/fsd/features/review-gate/index.ts");
    write(root, "src/fsd/features/review-gate/model/gate.ts", "export const gate = true;\n");
    write(
      root,
      "src/fsd/features/review-gate/ui/gate-button.tsx",
      'import { gate } from "../model/gate";\nexport { gate };\n',
    );

    assert.deepEqual(verifyProject(root), []);
  });

  it("allows shared segments to import another shared public leaf", () => {
    const root = project();
    write(root, "src/fsd/shared/lib/class-name.ts", "export const cn = true;\n");
    write(
      root,
      "src/fsd/shared/ui/button.tsx",
      'import { cn } from "@/fsd/shared/lib/class-name";\nexport { cn };\n',
    );

    assert.deepEqual(verifyProject(root), []);
  });

  it("allows an FSD api server adapter to call src/server", () => {
    const root = project();
    write(root, "src/server/pipeline/board.ts", "export const board = true;\n");
    write(root, "src/fsd/features/review-gate/index.server.ts");
    write(
      root,
      "src/fsd/features/review-gate/api/review-gate.server.ts",
      '"use server";\nimport { board } from "@/server/pipeline/board";\nexport { board };\n',
    );

    assert.deepEqual(verifyProject(root), []);
  });

  it("rejects a client component importing server code", () => {
    const root = project();
    write(root, "src/server/pipeline/board.ts");
    write(root, "src/fsd/features/review-gate/index.ts");
    write(
      root,
      "src/fsd/features/review-gate/ui/gate-button.tsx",
      '"use client";\nimport { board } from "@/server/pipeline/board";\nexport { board };\n',
    );

    const actualCodes = codes(root);
    assert.ok(actualCodes.includes("fsd/server-import-boundary"));
    assert.ok(actualCodes.includes("next/no-server-import-in-client"));
  });

  it("rejects src/server imports from FSD", () => {
    const root = project();
    write(root, "src/fsd/entities/board-item/index.ts");
    write(
      root,
      "src/server/pipeline/board.ts",
      'import { item } from "@/fsd/entities/board-item";\nexport { item };\n',
    );

    assert.ok(codes(root).includes("server/no-fsd-import"));
  });

  it("rejects external dependencies from packages/core", () => {
    const root = project();
    write(
      root,
      "packages/core/pipeline/transitions.mjs",
      'import { z } from "zod";\nexport { z };\n',
    );

    assert.ok(codes(root).includes("core/no-external-dependency"));
  });

  it("requires a public API for every non-empty slice", () => {
    const root = project();
    write(root, "src/fsd/entities/board-item/model/board-item.ts");

    assert.ok(codes(root).includes("fsd/public-api-required"));
  });

  it("allows web and server consumers of dependency-free GitHub modules", () => {
    const root = project();
    write(root, "packages/github/repo-url.mjs");
    write(root, "packages/github/blob-url.mjs", 'export { parse } from "./repo-url.mjs";\n');
    write(root, "packages/github/repository.mjs", 'export { parse } from "@harness/github/repo-url.mjs";\n');
    write(root, "packages/github/repo-url.test.mjs", 'import assert from "node:assert/strict";\nimport { it } from "node:test";\nimport { parse } from "./repo-url.mjs";\n');
    write(root, "src/fsd/shared/lib/repo-url.ts", '"use client";\nexport { parse } from "@harness/github/repo-url.mjs";\n');
    write(root, "src/server/projects/repo-url.ts", 'export { parse } from "@harness/github/repo-url.mjs";\n');

    assert.deepEqual(verifyProject(root), []);
  });

  it("keeps GitHub modules independent of product, core, npm and Node runtime code", () => {
    for (const specifier of ["@/server/github/api.server", "../../src/server/db", "@harness/core/project-slug.mjs", "../core/project-slug.mjs", "zod", "node:crypto"]) {
      const root = project();
      write(root, "packages/github/repo-url.mjs", `import "${specifier}";\n`);
      assert.ok(codes(root).includes("github/no-external-dependency"), specifier);
    }
  });

  it("keeps core independent of GitHub modules through aliases and relative imports", () => {
    for (const specifier of ["@harness/github/repo-url.mjs", "../github/repo-url.mjs"]) {
      const root = project();
      write(root, "packages/core/project-slug.mjs", `import "${specifier}";\n`);
      write(root, "packages/github/repo-url.mjs");
      assert.ok(codes(root).includes("core/no-external-dependency"), specifier);
    }
  });

  it("prevents GitHub production modules from importing Node-only tests", () => {
    const root = project();
    write(root, "packages/github/repo-url.mjs", 'import "./repo-url.test.mjs";\n');
    write(root, "packages/github/repo-url.test.mjs", 'import { it } from "node:test";\n');
    assert.ok(codes(root).includes("github/no-external-dependency"));
  });

  it("rejects simultaneous root app and src/app directories", () => {
    const root = project();
    write(root, "app/page.tsx");
    write(root, "src/app/page.tsx");

    assert.ok(codes(root).includes("next/no-dual-app-roots"));
  });

  it("rejects technical top-level source folders", () => {
    const root = project();
    write(root, "src/components/project-card.tsx");

    assert.ok(codes(root).includes("fsd/no-technical-top-level-folder"));
  });
});
