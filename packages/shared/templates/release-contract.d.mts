export type Installation = { releaseId: string; language: string; protocol: "template-release-v1"; clientSurfaceHash: string };

export const TEMPLATE_PROTOCOL: "template-release-v1";

export type TemplateContract = Readonly<{ schemaVersion: 1; parser: 1; runtime: "harness-runtime-v1"; aliases: 1; minimumClaudeVersion: string; installationGuide: string; clients: readonly ["claude", "codex"] }>;

export const TEMPLATE_CONTRACT: TemplateContract;

export function readTemplateContract(manifest: unknown, expectedHash: string): TemplateContract;

export function installationGuide(installation: Installation): string;

export function compatibleInstallation(installed: Installation | null | undefined, required: Installation): boolean;
