import type { Failure, FailureCode } from "./contracts";

const messages: Record<FailureCode, string> = {
  UNAUTHENTICATED: "Sign in again to continue.",
  INVALID_INPUT: "Check the repository connection request.",
  INVALID_STATE: "This connection attempt is no longer valid. Start again or paste a repository URL.",
  STALE_CONNECTION: "Repository access changed. Reload the list and confirm your selection.",
  ACCOUNT_MISMATCH: "Use the same GitHub account as your Stagekeeper sign-in.",
  REAUTH_REQUIRED: "Reconnect the repository list, or paste a repository URL.",
  PERMISSION_REQUIRED: "Check repository access on GitHub, or paste a repository URL.",
  RATE_LIMITED: "GitHub is limiting requests. Wait and try again, or paste a repository URL.",
  UNAVAILABLE: "The repository list is unavailable. You can still paste a repository URL.",
};

export function failure(code: FailureCode, retryAfter?: number): Failure {
  const status = code === "UNAUTHENTICATED" ? 401 : code === "RATE_LIMITED" ? 429
    : code === "UNAVAILABLE" ? 503 : code === "INVALID_INPUT" || code === "INVALID_STATE" ? 400 : 409;
  return { ok: false, code, message: messages[code], status, ...(retryAfter === undefined ? {} : { retryAfter }) };
}
