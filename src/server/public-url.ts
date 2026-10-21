const LOCAL_DEV_URL = "http://localhost:3000";
let reportedMissing = false;

function publicUrl(): string {
  const configured = process.env.HARNESS_PUBLIC_URL;
  if (configured === undefined && process.env.NODE_ENV === "production" && !reportedMissing) {
    reportedMissing = true;
    console.error("HARNESS_PUBLIC_URL is not set; token screens show the local development URL", { fallback: LOCAL_DEV_URL });
  }
  return (configured ?? LOCAL_DEV_URL).replace(/\/$/, "");
}

export function siteUrl(): URL {
  return new URL(process.env.HARNESS_PUBLIC_URL ?? LOCAL_DEV_URL);
}

export function mcpUrl(): string {
  return `${publicUrl()}/api/mcp`;
}

export function ownerMcpUrl(): string {
  return `${publicUrl()}/api/mcp/owner`;
}
