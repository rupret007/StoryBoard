-- CreateTable
CREATE TABLE "BookingAdvisorRun" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "inputFacts" JSONB NOT NULL,
    "advice" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAdvisorRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAdvisorFeedback" (
    "id" TEXT NOT NULL,
    "advisorRunId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingAdvisorFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingAdvisorRun_artistId_createdAt_idx" ON "BookingAdvisorRun"("artistId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingAdvisorFeedback_advisorRunId_idx" ON "BookingAdvisorFeedback"("advisorRunId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAdvisorFeedback_advisorRunId_operatorId_key" ON "BookingAdvisorFeedback"("advisorRunId", "operatorId");

-- AddForeignKey
ALTER TABLE "BookingAdvisorRun" ADD CONSTRAINT "BookingAdvisorRun_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAdvisorFeedback" ADD CONSTRAINT "BookingAdvisorFeedback_advisorRunId_fkey" FOREIGN KEY ("advisorRunId") REFERENCES "BookingAdvisorRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAdvisorFeedback" ADD CONSTRAINT "BookingAdvisorFeedback_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
