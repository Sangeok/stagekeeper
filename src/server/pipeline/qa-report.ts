import { qaText, qaHttpUrl } from "@harness/shared/qa/validation.mjs";

export type QaStatus = "pass" | "fail" | "blocked";

export type QaReport = { verdict: QaStatus; targetCommit: string; baseUrl: string | null; scenarios: { id: string; status: QaStatus; expected: string; actual: string; evidence: string[] }[] };

type QaReportInput = { verdict: QaStatus; targetCommit: unknown; baseUrl: unknown; scenarios: unknown };
type QaScenarioInput = { status: QaStatus; id: unknown; expected: unknown; actual: unknown; evidence: unknown };

export function parseQaReport(input: unknown): QaReport {
  const value = input as QaReportInput | null;
  if (!value || !["pass", "fail", "blocked"].includes(value.verdict)) throw new Error("qa.verdict: pass | fail | blocked required");
  const targetCommit = qaText(value.targetCommit, "qa.targetCommit", 40);
  if (!/^[0-9a-f]{7,40}$/.test(targetCommit)) throw new Error("qa.targetCommit: actual implementation commit required");
  const baseUrl = value.verdict === "blocked" && value.baseUrl === null ? null : qaHttpUrl(value.baseUrl, "qa.baseUrl");
  if (!Array.isArray(value.scenarios) || !value.scenarios.length || value.scenarios.length > 50) throw new Error("qa.scenarios: 1..50 results required");
  const scenarios = value.scenarios.map((candidate: unknown) => {
    const result = candidate as QaScenarioInput | null;
    if (!result || !["pass", "fail", "blocked"].includes(result.status)) throw new Error("qa scenario status required");
    if (!Array.isArray(result.evidence) || !result.evidence.length || result.evidence.length > 10) throw new Error("qa scenario evidence required");
    return { id: qaText(result.id, "qa scenario id", 100), status: result.status, expected: qaText(result.expected, "qa expected"), actual: qaText(result.actual, "qa actual"), evidence: result.evidence.map((item: unknown) => qaText(item, "qa evidence")) };
  });
  if (new Set(scenarios.map(result => result.id)).size !== scenarios.length) throw new Error("qa scenario ids must be unique");
  if (value.verdict === "pass" && scenarios.some(result => result.status !== "pass")) throw new Error("qa pass requires every required scenario to pass");
  if (value.verdict === "fail" && !scenarios.some(result => result.status === "fail")) throw new Error("qa fail requires a failed scenario");
  if (value.verdict === "blocked" && !scenarios.some(result => result.status === "blocked")) throw new Error("qa blocked requires an explicit blocker");
  const result = { verdict: value.verdict, targetCommit, baseUrl, scenarios };
  if (JSON.stringify(result).length > 64000) throw new Error("qa report too large");
  return result;
}
