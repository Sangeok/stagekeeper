export const PLUGIN_MARKETPLACE = "Sangeok/stagekeeper";
export const PLUGIN_ID = "harness@stagekeeper-local";

export const installCommands: readonly string[] = [
  `claude plugin marketplace add ${PLUGIN_MARKETPLACE}`,
  `claude plugin install ${PLUGIN_ID}`,
];
