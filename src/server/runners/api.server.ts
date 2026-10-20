import "server-only";
import { prisma } from "../db";
import { readRunnerState as readState, readRunnerSummaries as readSummaries, runRunnerOp as runOp } from "./runner-service";

export function readRunnerState(projectId: string): ReturnType<typeof readState> {
  return readState(prisma, projectId);
}

export function readRunnerSummaries(projectIds: readonly string[]): ReturnType<typeof readSummaries> {
  return readSummaries(prisma, projectIds);
}

export function runRunnerOp(input: Parameters<typeof runOp>[1]): ReturnType<typeof runOp> {
  return runOp(prisma, input);
}
