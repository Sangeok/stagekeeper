export const ROSTER = ["web-dev", "admin-dev", "backend-dev"];
export const TODAY = new Date("2026-08-15T00:01:00Z");

export const row = ({ key = "X-0", ...fields } = {}) => ({
  agent: "web-dev",
  status: "proposed",
  reason: "Observed evidence.",
  results: [],
  proposedOn: new Date("2026-08-14T23:59:00Z"),
  backlogItem: { key },
  gate: { proposed: "before-plan", in_review: "before-implement" }[fields.status ?? "proposed"] ?? null,
  node: { planning: "plan", implementing: "implement" }[fields.status ?? "proposed"] ?? null,
  dispatched: true,
  ...fields,
});

export const BOARD = [
  row({ key: "FEAT-05", status: "proposed", reason: "pm picked it today." }),
  row({ key: "FEAT-04", status: "in_review", agent: "admin-dev", results: ["Draft plan done."] }),
  row({ key: "FEAT-06", status: "planning", agent: "admin-dev" }),
  row({ key: "FEAT-07", status: "implementing" }),
  row({ key: "FEAT-02", status: "done", results: ["Shipped the fix. Verified in prod."] }),
  row({ key: "FEAT-03", status: "on_hold", agent: "backend-dev", results: ["Owner decision — waiting on the API."] }),
  row({ key: "FEAT-01", status: "proposed", agent: "backend-dev", reason: "x".repeat(151), proposedOn: new Date("2026-08-02T12:00:00Z") }),
];
