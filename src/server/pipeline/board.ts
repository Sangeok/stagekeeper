import "server-only";
import { prisma } from "@/server/db";
import { createBoardQueries } from "./board-query";
export type { Caller, Channel, Proposer, ServerResult } from "./board-query";
export const createBoardService = createBoardQueries;
export const { latestBoard, walkingKeys, latestBoardWithEvents, latestRowFor, availableBacklogCount, backlogWithStatus, getWithHistory, hasHistoryBefore, propose, transitionIn, transition, discard, gate, recordValidation, submitPlan, submitReport, advanceRun, resetRun, advancePipeline } = createBoardService(prisma);
