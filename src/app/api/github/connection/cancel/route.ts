import { cancelRepositoryConnection } from "@/server/github/api.server";
import { connectionMutation } from "../../request";

export async function POST(request: Request): Promise<Response> {
  return connectionMutation(request, ({ identity, browser, body }) => cancelRepositoryConnection(identity.userId, browser, body), {});
}
