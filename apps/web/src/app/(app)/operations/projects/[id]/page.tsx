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
  return <div className="space-y-6"><PageHeader title={data.project.name} description="Milestones, owners, assets, budget, and the next credible move." /><ProjectClient initialData={data} members={members.filter((member) => member.active)} /></div>;
}
