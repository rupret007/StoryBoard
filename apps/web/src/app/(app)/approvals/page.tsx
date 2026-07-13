import { PageHeader } from "@storyboard/ui";
import { ApprovalsClient } from "./approvals-client";
import { serverApiFetch } from "@/lib/api-server";
import type { ApprovalWorkQueue } from "@/lib/types";

export default async function ApprovalsPage() {
  let queue: ApprovalWorkQueue | null = null;
  let loadError: string | null = null;

  try {
    queue = await serverApiFetch<ApprovalWorkQueue>("/approvals/work-queue", {
      cache: "no-store"
    });
  } catch {
    loadError =
      "StoryBoard could not load the approval queue. Its status is unknown; refresh after the API is available.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Approval center"
        description="Decide what may proceed, run approved work deliberately, and preserve append-only evidence when a provider outcome must be checked."
      />
      <ApprovalsClient initialQueue={queue} loadError={loadError} />
    </div>
  );
}
