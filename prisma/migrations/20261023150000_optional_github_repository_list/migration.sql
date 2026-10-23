-- CreateTable
CREATE TABLE "GitHubConnection" (
    "userId" TEXT NOT NULL,
    "githubId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "refreshLeaseId" TEXT,
    "refreshLeaseExpiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GitHubConnectAttempt" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expectedRevision" INTEGER NOT NULL,
    "verifier" TEXT,
    "draft" TEXT,
    "outcome" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubConnectAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallation" (
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,

    CONSTRAINT "GitHubInstallation_pkey" PRIMARY KEY ("userId","installationId")
);

-- CreateTable
CREATE TABLE "GitHubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnection_githubId_key" ON "GitHubConnection"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConnectAttempt_stateHash_key" ON "GitHubConnectAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubConnectAttempt_userId_browserHash_createdAt_idx" ON "GitHubConnectAttempt"("userId", "browserHash", "createdAt");

-- CreateIndex
CREATE INDEX "GitHubConnectAttempt_expiresAt_idx" ON "GitHubConnectAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "GitHubInstallation_installationId_idx" ON "GitHubInstallation"("installationId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_expiresAt_idx" ON "GitHubWebhookDelivery"("expiresAt");

-- AddForeignKey
ALTER TABLE "GitHubConnection" ADD CONSTRAINT "GitHubConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubConnectAttempt" ADD CONSTRAINT "GitHubConnectAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallation" ADD CONSTRAINT "GitHubInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "GitHubConnection"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
