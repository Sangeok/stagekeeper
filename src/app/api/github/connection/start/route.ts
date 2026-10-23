import { startRepositoryConnection } from "@/server/github/api.server";
import { connectionMutation } from "../../request";

export async function POST(request: Request): Promise<Response> {
  return connectionMutation(request, ({ identity, browser, body }) => startRepositoryConnection({ ...identity, browser, body }), { createBinding: true });
}
