import { PageHeader } from "@storyboard/ui";
import { serverApiFetch } from "@/lib/api-server";
import type { BandMember, ManagerGoal, ManagerProfile, ManagerRun } from "@/lib/types";
import { ManagerClient } from "./manager-client";

export default async function ManagerPage() {
  let profile: ManagerProfile | null = null; let members: BandMember[] = []; let goals: ManagerGoal[] = []; let brief: ManagerRun | null = null;
  try { [profile, members, goals, brief] = await Promise.all([serverApiFetch<ManagerProfile | null>("/manager/profile", { cache: "no-store" }), serverApiFetch<BandMember[]>("/manager/members", { cache: "no-store" }), serverApiFetch<ManagerGoal[]>("/manager/goals", { cache: "no-store" }), serverApiFetch<ManagerRun | null>("/manager/brief?cadence=daily", { cache: "no-store" })]); } catch { /* setup remains usable */ }
  return <div className="space-y-8"><PageHeader title="Manager" description="Your priorities, decisions, risks, and next actions — grounded in StoryBoard records and gated before outside action." /><ManagerClient initialProfile={profile} initialMembers={members} initialGoals={goals} initialBrief={brief} /></div>;
}
