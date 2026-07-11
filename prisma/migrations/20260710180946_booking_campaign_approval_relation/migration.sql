-- AddForeignKey
ALTER TABLE "BookingCampaign" ADD CONSTRAINT "BookingCampaign_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
