// src/app/api/mcp/owner/route.ts — 소유자 토큰용 MCP 서버. 에이전트 서버(/api/mcp)와 도구 집합·검증기가 다르다.
// route는 transport 배선만 한다. 정책은 전부 @/server/mcp 안에 있다.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prismaOwnerToolDeps, verifyOwnerToken } from "@/server/mcp/owner-deps";
import { registerOwnerTools } from "@/server/mcp/owner-tools";

const handler = createMcpHandler((server) => registerOwnerTools(server, prismaOwnerToolDeps), { serverInfo: { name: "harness_owner", version: "0.1.0" } });

const authed = withMcpAuth(handler, verifyOwnerToken, { required: true });

export { authed as GET, authed as POST };
