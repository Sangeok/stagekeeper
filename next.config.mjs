// @ts-check

const windowsRole = process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  // Next's CLI checker opens ignored stdin through NUL. Avoid that device access
  // in Windows Server LPAC with the supported compiler API and piped IPC worker.
  // This project's TypeScript provides the API; type errors still fail the build.
  ...(windowsRole ? { experimental: { cpus: 2, useTypeScriptCli: false } } : {}),
  webpack(config) {
    if (!windowsRole) return config;
    // A fresh role snapshot discards every build artifact, including caches.
    config.cache = false;
    let delegatedLoaders = 0;
    const visited = new WeakSet();
    // Webpack's existing tsconfig plugin resolves the aliases. SWC's additional
    // alias pass calls Rust canonicalize, which cannot query DOS volume names in
    // AppContainer. Preserve the original tsconfig for type checking/resolution.
    /** @param {unknown} value */
    function visit(value) {
      if (!value || typeof value !== "object" || visited.has(value)) return;
      visited.add(value);
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      if (!isRecord(value)) return;
      const options = value.options;
      if (value.loader === "next-swc-loader" && isRecord(options) && isRecord(options.jsConfig)
        && isRecord(options.jsConfig.compilerOptions) && isRecord(options.jsConfig.compilerOptions.paths)) {
        value.options = {
          ...options,
          jsConfig: {
            ...options.jsConfig,
            compilerOptions: { ...options.jsConfig.compilerOptions, paths: undefined },
          },
        };
        delegatedLoaders++;
      }
      for (const key of ["rules", "oneOf", "use"]) visit(value[key]);
    }
    visit(config.module.rules);
    // Next's loader shape is not a stable API. Keep upgrades fail-closed and
    // verify actual alias imports with the full native build in CI.
    if (delegatedLoaders === 0) throw new Error("Windows role build requires the verified Next SWC loader configuration");
    return config;
  },
};

export default nextConfig;
