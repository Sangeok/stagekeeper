import os from "node:os";

export function matchesMacCloseoutHostV1() {
  return process.platform === "darwin" && os.release() === "25.2.0" && process.arch === "arm64"
    && process.version === "v26.4.0" && process.getuid?.() > 0 && process.getuid() === process.geteuid?.();
}
