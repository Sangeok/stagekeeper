import "server-only";
import { prisma } from "@/server/db";
import { createBoardQueries } from "./board-service";
export type { Caller, Channel, Proposer, ServerResult } from "./board-service";
export const createBoardService = createBoardQueries;
export const { addBacklog, updateBacklog, removeBacklog, latestBoard, latestBoardWithEvents, latestRowFor, backlogWithStatus, getWithHistory, hasHistoryBefore, projectHistory, projectHistoryItems, hasProjectHistoryBefore, currentRoundIds, propose, changePipeline, transition, discard, gate, retryAcceptance } = createBoardService(prisma);
