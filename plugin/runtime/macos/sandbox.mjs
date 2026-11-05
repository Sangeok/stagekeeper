import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const quote = value => JSON.stringify(value);

export function commandProfile(root, runtime, allowed, denied) {
  const repo = path.join(root, "repo"), scratch = path.join(root, "scratch");
  const system = ["/System", "/usr/lib", "/usr/share", "/Library/Apple/System/Library", "/bin", "/usr/bin", "/usr/sbin", "/private/var/select", "/private/etc"];
  const subpaths = values => values.map(value => `(subpath ${quote(value)})`).join(" ");
  return `(version 1)
(deny default)
(allow process-exec process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow sysctl-read)
(allow file-read-metadata)
(allow file-read* (literal "/"))
(allow file-map-executable ${subpaths(["/System", "/usr/lib", "/Library/Apple", "/bin", "/usr/bin", "/usr/sbin", runtime, repo, scratch])})
(allow system-mac-syscall (mac-policy-name "vnguard"))
(allow system-mac-syscall (require-all (mac-policy-name "Sandbox") (mac-syscall-number 67)))
(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow file-read* ${subpaths([...system, runtime, repo, scratch])} (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random") (literal ${quote(allowed)}))
(allow file-write* ${subpaths([repo, scratch])} (literal "/dev/null"))
(deny file-read* (literal ${quote(denied)}))
`;
}

export function readCommandIdentity(root, nonce) {
  const physical = realpathSync(root), parent = realpathSync(tmpdir());
  if (physical !== root || lstatSync(root).isSymbolicLink() || path.dirname(root) !== parent
    || !/^harness-command-[A-Za-z0-9_-]+$/.test(path.basename(root))) throw new Error("macOS command identity path refused");
  const request = path.join(root, "request.json");
  if (!lstatSync(request).isFile() || lstatSync(request).isSymbolicLink()) throw new Error("macOS command identity file refused");
  const value = JSON.parse(readFileSync(request, "utf8"));
  if (value.nonce !== nonce || value.root !== root || !/^[0-9a-f-]{36}$/.test(nonce)
    || value.allowed !== path.join(root, `allow-${nonce}`) || value.denied !== path.join(root, `deny-${nonce}`)) throw new Error("macOS command identity differs");
  return value;
}

export function endSandbox(root, nonce, scanner) {
  const request = readCommandIdentity(root, nonce);
  const result = JSON.parse(execFileSync(scanner, [request.allowed, request.denied, "200", "freeze"], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 }));
  if (result.selfSandboxed !== 0 || result.quiescent !== true || !Array.isArray(result.rounds) || result.rounds.length < 3
    || result.rounds.some(round => round.errors !== 0 || round.overflow !== 0 || round.untimed !== 0)
    || result.rounds.slice(-3).some(round => round.matches.length !== 0)) throw new Error("macOS descendant termination unconfirmed; ownership retained");
  return { quiescent: true, rounds: result.rounds.length };
}
