import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIP_DIRECTORIES = new Set([".git", ".next", "node_modules", "generated", "out", "build"]);
const FSD_LAYERS = ["pages", "widgets", "features", "entities", "shared"];
const LAYER_RANK = new Map(FSD_LAYERS.map((layer, index) => [layer, FSD_LAYERS.length - index]));
const SLICE_SEGMENTS = new Set(["api", "config", "lib", "model", "ui"]);
const SHARED_SEGMENTS = new Set(["api", "assets", "config", "i18n", "lib", "routes", "ui"]);
const FORBIDDEN_TOP_LEVEL_FOLDERS = ["components", "hooks", "lib", "types", "utils"];
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toPosix(path) {
  return path.replaceAll("\\", "/");
}

function isSourceFile(path) {
  return SOURCE_EXTENSIONS.has(extname(path)) && !path.endsWith(".d.ts");
}

function walk(directory) {
  if (!existsSync(directory)) return [];

  const files = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;

    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (stats.isFile() && isSourceFile(path)) files.push(path);
  }

  return files;
}

function extractImports(source) {
  const imports = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function sourceLine(source, specifier) {
  const doubleQuoted = source.indexOf(`"${specifier}"`);
  const singleQuoted = source.indexOf(`'${specifier}'`);
  const positions = [doubleQuoted, singleQuoted].filter((position) => position >= 0);
  if (positions.length === 0) return 1;
  return source.slice(0, Math.min(...positions)).split(/\r?\n/).length;
}

function resolveImport(projectRoot, importer, specifier) {
  if (specifier.startsWith("@/")) {
    return { kind: "file", path: resolve(projectRoot, "src", specifier.slice(2)) };
  }
  if (specifier.startsWith("@harness/core/")) {
    return {
      kind: "file",
      path: resolve(projectRoot, "packages", "core", specifier.slice("@harness/core/".length)),
    };
  }
  if (specifier.startsWith(".")) {
    return { kind: "file", path: resolve(dirname(importer), specifier) };
  }
  return { kind: "bare", path: null };
}

function projectPath(projectRoot, path) {
  return toPosix(relative(projectRoot, path));
}

function parseFsdPath(projectRoot, path) {
  const parts = projectPath(projectRoot, path).split("/");
  if (parts[0] !== "src" || parts[1] !== "fsd" || !FSD_LAYERS.includes(parts[2])) {
    return null;
  }

  const layer = parts[2];
  return {
    layer,
    slice: layer === "shared" ? null : parts[3] ?? null,
    parts: parts.slice(2),
  };
}

function isInside(projectRoot, path, directory) {
  const candidate = projectPath(projectRoot, path);
  return candidate === directory || candidate.startsWith(`${directory}/`);
}

function issue(projectRoot, file, line, code, message) {
  return { file: projectPath(projectRoot, file), line, code, message };
}

function hasServerBoundary(source) {
  return (
    /^\s*["']use server["'];?/m.test(source) ||
    /\bimport\s+["']server-only["']/.test(source)
  );
}

function hasClientBoundary(source) {
  return /^\s*["']use client["'];?/m.test(source);
}

function isServerAdapter(projectRoot, importer, source) {
  const path = projectPath(projectRoot, importer);
  return path.includes("/api/") && hasServerBoundary(source);
}

function isPublicFsdImport(target) {
  const [, ...rest] = target.parts;

  if (target.layer === "shared") {
    return rest.length >= 1 && rest.length <= 2;
  }

  if (rest.length === 1) return true;
  return rest.length === 2 && ["index", "index.server"].includes(rest[1]);
}

function validateFsdImport({ projectRoot, importer, source, specifier, targetPath }) {
  const problems = [];
  const importerFsd = parseFsdPath(projectRoot, importer);
  const targetFsd = parseFsdPath(projectRoot, targetPath);
  const line = sourceLine(source, specifier);

  if (!targetFsd) return problems;

  if (!importerFsd) {
    if (!isPublicFsdImport(targetFsd)) {
      problems.push(issue(
        projectRoot,
        importer,
        line,
        "fsd/no-deep-import",
        `FSD 외부에서는 public API만 import해야 합니다: ${specifier}`,
      ));
    }
    return problems;
  }

  if (importerFsd.layer === targetFsd.layer) {
    if (importerFsd.layer !== "shared" && importerFsd.slice !== targetFsd.slice) {
      problems.push(issue(
        projectRoot,
        importer,
        line,
        "fsd/no-cross-slice-import",
        `같은 ${importerFsd.layer} layer의 다른 slice를 import할 수 없습니다: ${specifier}`,
      ));
    } else if (
      importerFsd.layer !== "shared" &&
      importerFsd.slice === targetFsd.slice &&
      !specifier.startsWith(".")
    ) {
      problems.push(issue(
        projectRoot,
        importer,
        line,
        "fsd/prefer-relative-within-slice",
        `같은 slice 내부 import는 상대 경로를 사용하세요: ${specifier}`,
      ));
    }
  } else if (LAYER_RANK.get(targetFsd.layer) >= LAYER_RANK.get(importerFsd.layer)) {
    problems.push(issue(
      projectRoot,
      importer,
      line,
      "fsd/layers-import",
      `${importerFsd.layer} layer는 ${targetFsd.layer} layer를 import할 수 없습니다: ${specifier}`,
    ));
  }

  const crossesSlice =
    importerFsd.layer !== targetFsd.layer ||
    (importerFsd.layer !== "shared" && importerFsd.slice !== targetFsd.slice);
  if (crossesSlice && !isPublicFsdImport(targetFsd)) {
    problems.push(issue(
      projectRoot,
      importer,
      line,
      "fsd/no-deep-import",
      `다른 slice의 내부 파일 대신 public API를 import하세요: ${specifier}`,
    ));
  }

  return problems;
}

function validateImports(projectRoot, files) {
  const problems = [];

  for (const importer of files) {
    const source = readFileSync(importer, "utf8");
    const importerFsd = parseFsdPath(projectRoot, importer);
    const importerIsClient = hasClientBoundary(source);

    for (const specifier of extractImports(source)) {
      const target = resolveImport(projectRoot, importer, specifier);
      const line = sourceLine(source, specifier);

      if (isInside(projectRoot, importer, "packages/core")) {
        const allowedNodeBuiltin = target.kind === "bare" && specifier.startsWith("node:");
        const allowedLocalCore =
          target.kind === "file" && isInside(projectRoot, target.path, "packages/core");
        if (!allowedNodeBuiltin && !allowedLocalCore) {
          problems.push(issue(
            projectRoot,
            importer,
            line,
            "core/no-external-dependency",
            `packages/core는 src 또는 외부 package에 의존할 수 없습니다: ${specifier}`,
          ));
        }
      }

      if (target.kind !== "file") continue;

      const targetIsServer = isInside(projectRoot, target.path, "src/server");
      const targetIsFsd = parseFsdPath(projectRoot, target.path) !== null;
      const targetLooksServerOnly =
        specifier.includes("index.server") || /\.server(?:\.|$)/.test(specifier);

      if (isInside(projectRoot, importer, "src/server") && targetIsFsd) {
        problems.push(issue(
          projectRoot,
          importer,
          line,
          "server/no-fsd-import",
          `src/server는 프런트엔드 FSD를 import할 수 없습니다: ${specifier}`,
        ));
      }

      if (importerFsd && targetIsServer && !isServerAdapter(projectRoot, importer, source)) {
        problems.push(issue(
          projectRoot,
          importer,
          line,
          "fsd/server-import-boundary",
          `src/server import는 FSD api segment의 서버 adapter에서만 허용됩니다: ${specifier}`,
        ));
      }

      if (importerIsClient && (targetIsServer || targetLooksServerOnly)) {
        problems.push(issue(
          projectRoot,
          importer,
          line,
          "next/no-server-import-in-client",
          `Client Component가 서버 전용 모듈을 import할 수 없습니다: ${specifier}`,
        ));
      }

      problems.push(...validateFsdImport({
        projectRoot,
        importer,
        source,
        specifier,
        targetPath: target.path,
      }));
    }
  }

  return problems;
}

function validateFsdNames(projectRoot, fsdFiles) {
  const problems = [];

  for (const file of fsdFiles) {
    const parsed = parseFsdPath(projectRoot, file);
    const relativeParts = parsed.parts;
    const fileName = relativeParts.at(-1);
    const directories = relativeParts.slice(1, -1);

    if (parsed.layer !== "shared") {
      if (!parsed.slice) {
        problems.push(issue(
          projectRoot,
          file,
          1,
          "fsd/slice-required",
          `${parsed.layer} layer의 코드는 slice 안에 있어야 합니다.`,
        ));
        continue;
      }
      if (!KEBAB_CASE.test(parsed.slice)) {
        problems.push(issue(
          projectRoot,
          file,
          1,
          "naming/kebab-case",
          `slice 이름은 kebab-case여야 합니다: ${parsed.slice}`,
        ));
      }
      if (directories.length >= 2 && !SLICE_SEGMENTS.has(directories[1])) {
        problems.push(issue(
          projectRoot,
          file,
          1,
          "fsd/unknown-segment",
          `허용되지 않은 segment입니다: ${directories[1]}`,
        ));
      }
    } else if (directories.length >= 1 && !SHARED_SEGMENTS.has(directories[0])) {
      problems.push(issue(
        projectRoot,
        file,
        1,
        "fsd/unknown-shared-segment",
        `shared segment는 목적을 명시해야 합니다: ${directories[0]}`,
      ));
    }

    for (const directory of directories) {
      if (!KEBAB_CASE.test(directory)) {
        problems.push(issue(
          projectRoot,
          file,
          1,
          "naming/kebab-case",
          `FSD 디렉터리 이름은 kebab-case여야 합니다: ${directory}`,
        ));
      }
    }

    const stem = fileName.slice(0, -extname(fileName).length);
    if (!stem.split(".").every((part) => KEBAB_CASE.test(part))) {
      problems.push(issue(
        projectRoot,
        file,
        1,
        "naming/kebab-case",
        `일반 파일명은 kebab-case여야 합니다: ${fileName}`,
      ));
    }
  }

  return problems;
}

function validatePublicApis(projectRoot, fsdFiles) {
  const problems = [];
  const slices = new Map();

  for (const file of fsdFiles) {
    const parsed = parseFsdPath(projectRoot, file);
    if (parsed.layer === "shared" || !parsed.slice) continue;

    const sliceDirectory = resolve(projectRoot, "src", "fsd", parsed.layer, parsed.slice);
    if (!slices.has(sliceDirectory)) slices.set(sliceDirectory, file);
  }

  const publicApiNames = [
    "index.cjs",
    "index.js",
    "index.jsx",
    "index.mjs",
    "index.server.js",
    "index.server.ts",
    "index.ts",
    "index.tsx",
  ];

  for (const [sliceDirectory, representativeFile] of slices) {
    if (!publicApiNames.some((name) => existsSync(join(sliceDirectory, name)))) {
      problems.push(issue(
        projectRoot,
        representativeFile,
        1,
        "fsd/public-api-required",
        `${projectPath(projectRoot, sliceDirectory)}에 index.ts 또는 index.server.ts public API가 필요합니다.`,
      ));
    }
  }

  return problems;
}

function validateProjectLayout(projectRoot) {
  const problems = [];
  const rootApp = resolve(projectRoot, "app");
  const srcApp = resolve(projectRoot, "src", "app");

  if (existsSync(rootApp) && existsSync(srcApp)) {
    problems.push(issue(
      projectRoot,
      srcApp,
      1,
      "next/no-dual-app-roots",
      "루트 app/과 src/app/을 함께 둘 수 없습니다. Next.js는 src/app/을 무시합니다.",
    ));
  }

  for (const folder of FORBIDDEN_TOP_LEVEL_FOLDERS) {
    const directory = resolve(projectRoot, "src", folder);
    const firstFile = walk(directory)[0];
    if (firstFile) {
      problems.push(issue(
        projectRoot,
        firstFile,
        1,
        "fsd/no-technical-top-level-folder",
        `src/${folder} 대신 책임을 소유한 FSD slice 또는 server 모듈에 코로케이션하세요.`,
      ));
    }
  }

  return problems;
}

export function verifyProject(projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const sourceFiles = [
    ...walk(resolve(root, "src")),
    ...walk(resolve(root, "packages", "core")),
  ];
  const fsdFiles = sourceFiles.filter((file) => parseFsdPath(root, file));

  return [
    ...validateProjectLayout(root),
    ...validateFsdNames(root, fsdFiles),
    ...validatePublicApis(root, fsdFiles),
    ...validateImports(root, sourceFiles),
  ].sort((left, right) => {
    return (
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.code.localeCompare(right.code)
    );
  });
}

function runCli() {
  const problems = verifyProject();

  if (problems.length === 0) {
    console.log("FSD architecture check passed.");
    return;
  }

  console.error(`FSD architecture check failed with ${problems.length} issue(s):`);
  for (const problem of problems) {
    console.error(`${problem.file}:${problem.line} [${problem.code}] ${problem.message}`);
  }
  process.exitCode = 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) runCli();
