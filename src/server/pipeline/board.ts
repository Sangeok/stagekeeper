import "server-only";
import { prisma } from "@/server/db";
import { createBoardQueries } from "./board-query";
export type { Caller, Channel, Proposer, ServerResult } from "./board-query";
export const createBoardService = createBoardQueries;
// transitionIn·advanceRun·resetRun은 결과형처럼 보이지만 대부분의 거부에서 BoardRejection을 던진다 —
// board-query.ts 안의 조합에서만 쓰므로 여기서 내보내지 않는다.
export const { latestBoard, walkingKeys, latestBoardWithEvents, latestRowFor, availableBacklogCount, backlogWithStatus, getWithHistory, hasHistoryBefore, propose, transition, discard, gate, recordValidation, submitPlan, submitReport, advancePipeline } = createBoardService(prisma);
