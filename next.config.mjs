// @ts-check

const windowsRole = process.platform === "win32" && process.env.STAGEKEEPER_ROLE_SNAPSHOT === "1";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  ...(windowsRole ? { experimental: { cpus: 2, useTypeScriptCli: false } } : {}),
  webpack(config) {
    if (!windowsRole) return config;
    config.cache = false;
    let delegatedLoaders = 0;
    const visited = new WeakSet();
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
    if (delegatedLoaders === 0) throw new Error("Windows role build requires the verified Next SWC loader configuration");
    return config;
  },
};

export default nextConfig;
