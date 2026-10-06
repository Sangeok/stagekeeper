export type QaStatus = "pass" | "fail" | "blocked";
export type QaReport = { verdict: QaStatus; targetCommit: string; baseUrl: string | null; scenarios: { id: string; status: QaStatus; expected: string; actual: string; evidence: string[] }[] };
export type QaConfig = { environment: "test"; baseUrl: string; mcpUrl: string; scenariosPath: string; artifactsDir?: string };
export const QA_BROWSER_TOOLS: string[];
export function parseQaConfig(value: unknown, release?: { baseUrl: string } | null): QaConfig | null;
export function parseQaReport(value: unknown): QaReport;
