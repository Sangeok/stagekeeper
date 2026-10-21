import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prismaOwnerToolDeps, verifyOwnerToken } from "@/server/mcp/api.server";
import { registerOwnerTools } from "@/server/mcp/api";

const handler = createMcpHandler((server) => registerOwnerTools(server, prismaOwnerToolDeps), { serverInfo: { name: "harness_owner", version: "0.1.0" } });

const authed = withMcpAuth(handler, verifyOwnerToken, { required: true });

export { authed as GET, authed as POST };
