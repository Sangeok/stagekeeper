import "server-only";

export function projectConnectionWritesEnabled(): boolean {
  return process.env.PROJECT_CONNECTION_WRITES_ENABLED === "true";
}
