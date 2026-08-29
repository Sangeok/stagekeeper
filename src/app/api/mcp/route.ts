// src/app/api/mcp/route.ts — mcp-handler 2.x: 이 경로에 바로 마운트. [transport]·basePath·SSE 없음.
// route는 transport 배선만 한다. DB 조회·정책은 전부 @/server/mcp 안에 있다
// (system-overview.md: "Route Handler와 page는 직접 정책을 재구현하지 않고 src/server를 호출한다").
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { prismaToolDeps, verifyProjectToken } from "@/server/mcp/deps";
import { registerTools } from "@/server/mcp/tools";

const handler = createMcpHandler((server) => registerTools(server, prismaToolDeps), { serverInfo: { name: "harness", version: "0.1.0" } });

const authed = withMcpAuth(handler, verifyProjectToken, { required: true });

export { authed as GET, authed as POST };
