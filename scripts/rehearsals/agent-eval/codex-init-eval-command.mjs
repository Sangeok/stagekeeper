export const dryRunHelper = "stagekeeper-eval-dry-run";

const helperWords = new Set([dryRunHelper, `'${dryRunHelper}'`, `"${dryRunHelper}"`]);

function decodeLiteralWord(text) {
  const parts = /'([^']*)'|"((?:[^"\\$`]|\\[\\$"`])*)"|\\([^\n])|([\w./:@%+=,-]+)/y;
  let value = "";
  while (parts.lastIndex < text.length) {
    const match = parts.exec(text);
    if (!match) return null;
    const [, single, double, escaped, bare] = match;
    value += single ?? double?.replace(/\\([\\$"`])/g, "$1") ?? escaped ?? bare;
  }
  return value;
}

function checksDryRunTargets(lines) {
  if (lines.length !== 3) return false;
  const guard = /^if[ \t]+\[\[[ \t]+(.+?)[ \t]+\]\][ \t]*;[ \t]*then$/.exec(lines[2]);
  if (!guard) return false;

  const expected = new Map();
  for (const line of lines.slice(0, 2)) {
    const assignment = /^(expected_[a-z_]+|launcher|repo)=(.+)$/.exec(line);
    if (!assignment) return false;
    expected.set(`"$${assignment[1]}"`, assignment[2]);
  }
  const comparisons = guard[1].split(/[ \t]+\|\|[ \t]+/).map(term => term.split(/[ \t]+/));
  if (expected.size !== 2 || comparisons.length !== 2 || comparisons[0][2] === comparisons[1][2]) return false;
  return ["LAUNCHER", "REPO"].every(target => {
    const variable = `STAGEKEEPER_EVAL_${target}`;
    const references = [`"$${variable}"`, `"\${${variable}}"`, `"\${${variable}:-}"`];
    return comparisons.some(([left, operator, right, ...extra]) => {
      if (extra.length || operator !== "!=" || !references.includes(left) || !expected.has(right)) return false;
      const value = expected.get(right);
      if (target === "REPO" && value === '"$(pwd -P)"') return true;
      const literal = decodeLiteralWord(value);
      return literal !== null && literal.startsWith("/") && (target === "REPO" || literal.endsWith("/bin/harness"));
    });
  });
}

function isDryRunScript(script) {
  const lines = script.split("\n").map(line => line.replace(/^[ \t]+|[ \t]+$/g, "")).filter(Boolean);
  if (!helperWords.has(lines.pop())) return false;
  if (lines.length === 0) return true;
  if (lines.pop() !== "fi") return false;
  const exit = /^exit[ \t]+([1-9]\d{0,2})$/.exec(lines.pop());
  if (!exit || Number(exit[1]) > 255) return false;
  if (lines.length === 4) {
    const message = /^printf[ \t]+'%s\\n'[ \t]+(.+)$/.exec(lines.pop());
    if (!message || decodeLiteralWord(message[1]) === null) return false;
  }
  return checksDryRunTargets(lines);
}

export function isDryRunCommand(command = "") {
  if (!command.includes(dryRunHelper)) return false;
  const shell = /^\/bin\/(?:zsh|bash|sh) -l?c /.exec(command);
  const argument = shell ? command.slice(shell[0].length) : command;
  const script = shell ? decodeLiteralWord(argument) : argument;
  return script !== null && isDryRunScript(script);
}
