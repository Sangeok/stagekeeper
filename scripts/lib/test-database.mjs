function identity(value) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PostgreSQL URL required");
  const database = decodeURIComponent(url.pathname.slice(1));
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ? "loopback" : url.hostname.toLowerCase();
  return { database, key: `${host}:${url.port || "5432"}/${database}` };
}

export function validateTestDatabaseUrl(value) {
  try {
    const test = identity(value);
    if (!/^stagekeeper_test_[a-zA-Z0-9_-]+$/.test(test.database)) throw new Error();
    return value;
  } catch {
    throw new Error("Set TEST_DATABASE_URL to a PostgreSQL stagekeeper_test_* database.");
  }
}

export function validateTestDatabase(env) {
  try {
    const url = validateTestDatabaseUrl(env.TEST_DATABASE_URL);
    if (env.DATABASE_URL && identity(env.DATABASE_URL).key === identity(url).key) throw new Error();
    return url;
  } catch {
    throw new Error("Set TEST_DATABASE_URL to a PostgreSQL stagekeeper_test_* database distinct from DATABASE_URL (host, port, database).");
  }
}
