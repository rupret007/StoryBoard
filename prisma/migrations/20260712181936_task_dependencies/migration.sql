-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "prerequisiteTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskDependency_artistId_taskId_idx" ON "TaskDependency"("artistId", "taskId");

-- CreateIndex
CREATE INDEX "TaskDependency_artistId_prerequisiteTaskId_idx" ON "TaskDependency"("artistId", "prerequisiteTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_taskId_prerequisiteTaskId_key" ON "TaskDependency"("taskId", "prerequisiteTaskId");

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
