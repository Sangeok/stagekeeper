import "server-only";
import { prisma } from "../db";
import { findUserTokenByHash as queryUserToken } from "./user-query";

export { issueProjectOwnerToken } from "./project-token";
export { issueProjectToken } from "./project-token";
export { recordTokenUsage } from "./usage";

export function findUserTokenByHash(hash: string): ReturnType<typeof queryUserToken> {
  return queryUserToken(hash, prisma);
}
