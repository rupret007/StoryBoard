import { PageHeader } from "@storyboard/ui";
import { ApprovalsClient } from "./approvals-client";
import { serverApiFetch } from "@/lib/api-server";
import type { ApprovalRequest } from "@/lib/types";

export default async function ApprovalsPage() {
  let pending: ApprovalRequest[] = [];
  let readyToExecute: ApprovalRequest[] = [];
  try {
    [pending, readyToExecute] = await Promise.all([
      serverApiFetch<ApprovalRequest[]>("/approvals/pending", { cache: "no-store" }),
      serverApiFetch<ApprovalRequest[]>("/approvals/ready-to-execute", {
        cache: "no-store"
      })
    ]);
  } catch {
    pending = [];
    readyToExecute = [];
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description="Review structured actions before any outbound or risky work. Decisions are audited."
      />
      <ApprovalsClient
        initialPending={pending}
        initialReadyToExecute={readyToExecute}
      />
    </div>
  );
}
