-- CreateTable
CREATE TABLE "PipelineVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nodes" TEXT[],
    "gates" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "PipelineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "boardItemId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineVersion_projectId_version_key" ON "PipelineVersion"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_boardItemId_key" ON "PipelineRun"("boardItemId");

-- AddForeignKey
ALTER TABLE "PipelineVersion" ADD CONSTRAINT "PipelineVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_boardItemId_fkey" FOREIGN KEY ("boardItemId") REFERENCES "BoardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PipelineVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
