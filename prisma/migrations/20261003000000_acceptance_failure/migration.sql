-- CreateTable
CREATE TABLE "AcceptanceFailure" (
    "id" TEXT NOT NULL,
    "boardItemId" TEXT NOT NULL,
    "checks" INTEGER[],
    "note" TEXT NOT NULL,
    "path" TEXT,
    "commit" TEXT,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "AcceptanceFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcceptanceFailure_boardItemId_clearedAt_idx" ON "AcceptanceFailure"("boardItemId", "clearedAt");

-- AddForeignKey
ALTER TABLE "AcceptanceFailure" ADD CONSTRAINT "AcceptanceFailure_boardItemId_fkey" FOREIGN KEY ("boardItemId") REFERENCES "BoardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
