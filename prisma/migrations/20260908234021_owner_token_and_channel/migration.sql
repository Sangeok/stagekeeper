-- AlterTable
ALTER TABLE "TransitionEvent" ADD COLUMN     "channel" TEXT;

-- CreateTable
CREATE TABLE "OwnerToken" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OwnerToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OwnerToken_hash_key" ON "OwnerToken"("hash");

-- CreateIndex
CREATE INDEX "OwnerToken_projectId_userId_idx" ON "OwnerToken"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "OwnerToken" ADD CONSTRAINT "OwnerToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerToken" ADD CONSTRAINT "OwnerToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
