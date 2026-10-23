import { disconnectRepositoryList } from "@/server/github/api.server";
import { connectionMutation } from "../../request";

export async function POST(request: Request): Promise<Response> {
  return connectionMutation(request, ({ identity, body }) => disconnectRepositoryList(identity.userId, body), { requireBinding: false });
}
