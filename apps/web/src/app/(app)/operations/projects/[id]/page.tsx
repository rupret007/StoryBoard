import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BandMember, ProjectReadinessResponse } from "@/lib/types";
import { ProjectClient } from "./project-client";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, members] = await Promise.all([
    serverApiFetch<ProjectReadinessResponse>(`/projects/${encodeURIComponent(id)}/readiness`, { cache: "no-store" }),
    serverApiFetch<BandMember[]>("/manager/members", { cache: "no-store" })
  ]);
  let accessState: "manage" | "read_only" | "unavailable" = "unavailable";
  try {
    const me = await serverApiFetch<{
      currentArtistId: string | null;
      memberships: { artistId: string; role: string }[];
    }>("/auth/me", { cache: "no-store" });
    const activeArtistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
      ? me.currentArtistId
      : me.memberships[0]?.artistId ?? null;
    const role = me.memberships.find((membership) => membership.artistId === activeArtistId)?.role;
    accessState = role === "owner" || role === "member"
      ? "manage"
      : role === "viewer"
        ? "read_only"
        : "unavailable";
  } catch {
    /* Keep the project readable while all changes fail closed. */
  }
  return <div className="space-y-6"><PageHeader title={data.project.name} description="Milestones, owners, assets, budget, and the next credible move." /><ProjectClient initialData={data} members={members.filter((member) => member.active)} accessState={accessState} /></div>;
}
