import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BandMember, ProjectReadinessResponse } from "@/lib/types";
import { ProjectClient } from "./project-client";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await serverApiFetch<{
    currentArtistId: string | null;
    memberships: { artistId: string; role: string }[];
  }>("/auth/me", { cache: "no-store" });
  const artistId = me.currentArtistId && me.memberships.some((membership) => membership.artistId === me.currentArtistId)
    ? me.currentArtistId
    : me.memberships[0]?.artistId ?? null;
  if (!artistId) throw new Error("Project band access could not be verified");
  const role = me.memberships.find((membership) => membership.artistId === artistId)?.role;
  const accessState = role === "owner" || role === "member" ? "manage" : role === "viewer" ? "read_only" : "unavailable";
  const [data, members] = await Promise.all([
    serverApiFetch<ProjectReadinessResponse>(`/projects/${encodeURIComponent(id)}/readiness`, { cache: "no-store", artistId }),
    serverApiFetch<BandMember[]>("/manager/members", { cache: "no-store", artistId })
  ]);
  return <div className="space-y-6"><PageHeader title={data.project.name} description="Milestones, owners, assets, budget, and the next credible move." /><ProjectClient key={`${artistId}:${id}`} artistId={artistId} initialData={data} members={members.filter((member) => member.active)} accessState={accessState} /></div>;
}
