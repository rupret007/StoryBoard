import { PageHeader } from "@storyboard/ui";
import { serverApiFetch, serverBandAccess } from "@/lib/api-server";
import { SocialClient, type SocialWorkspace } from "./social-client";

export default async function SocialPage() {
  let workspace: SocialWorkspace | null = null;
  let artistId: string | null = null;
  let canManage = false;
  let isOwner = false;
  let loadError = "";
  try {
    const access = await serverBandAccess();
    artistId = access.artistId;
    canManage = access.canManage;
    isOwner = access.isOwner;
    workspace = await serverApiFetch<SocialWorkspace>("/social", {
      cache: "no-store",
      artistId
    });
  } catch {
    loadError =
      "Social could not be loaded. Reload to verify your band. Nothing was posted.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Social"
        description="Drop media and a note, review per-platform drafts in this band's voice, then approve once. Nothing posts without that approval record, and nothing is marked posted until the platform returns an ID."
      />
      {loadError ? (
        <p role="alert" className="text-sm text-rose-200">
          {loadError}
        </p>
      ) : (
        <SocialClient
          key={artistId ?? "unverified"}
          artistId={artistId}
          canManage={canManage}
          isOwner={isOwner}
          initial={workspace}
        />
      )}
    </div>
  );
}
