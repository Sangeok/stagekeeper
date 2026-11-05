export const CODEX_UNSUPPORTED_PLATFORM = "Stagekeeper works with Codex on Windows and macOS. Other operating systems are not supported yet.";
export const supportsCodexPlatform = (platform = process.platform) => ["win32", "darwin"].includes(platform);

export class CodexPlatformUnsupported extends Error {
  constructor() {
    super(CODEX_UNSUPPORTED_PLATFORM);
    this.name = "CodexPlatformUnsupported";
    this.code = "codex-platform";
  }
}
