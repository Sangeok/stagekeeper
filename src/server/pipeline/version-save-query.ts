import { Prisma } from "@/generated/prisma/client";
import { SLOT_FORMAT } from "@harness/core/pipeline.mjs";

type SaveInput = { projectId: string; userId: string; graph: { nodes: string[]; gates: string[] }; expectedVersion: number };
type SaveResult = { status: "success"; version: number } | { status: "stale" } | { status: "error"; reason: string };

// The unique constraint also serializes baseline-zero saves against the default materializer.
export async function savePipelineVersion(db: Pick<Prisma.TransactionClient, "pipelineVersion">, input: SaveInput): Promise<SaveResult> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 2_147_483_646) {
    return { status: "error", reason: "Invalid pipeline save request." };
  }
  const latest = await db.pipelineVersion.findFirst({ where: { projectId: input.projectId }, orderBy: { version: "desc" }, select: { version: true } });
  if ((latest?.version ?? 0) !== input.expectedVersion) return { status: "stale" };
  const version = input.expectedVersion + 1;
  try {
    await db.pipelineVersion.create({ data: { projectId: input.projectId, version, nodes: input.graph.nodes, gates: input.graph.gates, createdBy: input.userId, format: SLOT_FORMAT } });
    return { status: "success", version };
  } catch (error) {
    // Do not continue a PostgreSQL transaction after a unique violation.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { status: "stale" };
    throw error;
  }
}
