import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prismaToolDeps, verifyProjectToken } from "@/server/mcp/api.server";
import { registerTools } from "@/server/mcp/api";

const handler = createMcpHandler((server) => registerTools(server, prismaToolDeps), { serverInfo: { name: "harness", version: "0.1.0" } });

const authed = withMcpAuth(handler, verifyProjectToken, { required: true });

export { authed as GET, authed as POST };
