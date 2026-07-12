import type { BandMode, ManagerWorkstream } from "../generated/prisma/enums";

export const MANAGER_PLAN_TEMPLATE_VERSION = "manager_plan_v1";

export type ManagerPlanTaskTemplate = {
  sourceKey: string;
  title: string;
  dueAt: Date;
  ownerLabel: string | null;
};

export type ManagerPlanInitiativeTemplate = {
  sourceKey: string;
  title: string;
  description: string;
  successMetric: string;
  dueAt: Date;
  tasks: ManagerPlanTaskTemplate[];
};

export type ManagerPlanGoalTemplate = {
  sourceKey: string;
  workstream: ManagerWorkstream;
  title: string;
  description: string;
  targetValue: number;
  targetUnit: string;
  currentValue: number;
  deadline: Date;
  initiative: ManagerPlanInitiativeTemplate;
};

function afterDays(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function goal(
  key: string,
  workstream: ManagerWorkstream,
  title: string,
  targetValue: number,
  targetUnit: string,
  initiativeTitle: string,
  successMetric: string,
  tasks: string[],
  now: Date
): ManagerPlanGoalTemplate {
  return {
    sourceKey: `${MANAGER_PLAN_TEMPLATE_VERSION}:goal:${key}`,
    workstream,
    title,
    description: "Editable 90-day starter target. Change the number or wording when the band has better evidence.",
    targetValue,
    targetUnit,
    currentValue: 0,
    deadline: afterDays(now, 90),
    initiative: {
      sourceKey: `${MANAGER_PLAN_TEMPLATE_VERSION}:initiative:${key}`,
      title: initiativeTitle,
      description: "A starter sequence that turns the goal into visible work; keep, edit, or pause it deliberately.",
      successMetric,
      dueAt: afterDays(now, 90),
      tasks: tasks.map((title, index) => ({
        sourceKey: `${MANAGER_PLAN_TEMPLATE_VERSION}:task:${key}:${index + 1}`,
        title,
        dueAt: afterDays(now, 7 + index * 7),
        ownerLabel: null
      }))
    }
  };
}

export function managerPlanTemplate(bandMode: BandMode, now = new Date()) {
  const release = () => goal(
    "release_cycle", "releases", bandMode === "original" ? "Ship the next release deliberately" : "Complete the next release cycle", 1, "release cycle",
    "Turn the next release into a dated, owned project",
    "A release date, asset checklist, milestones, and success measure are recorded.",
    ["Choose the release outcome and a realistic target date", "Audit recordings, artwork, distribution, and press assets", "Build the release milestones and first content calendar"], now
  );
  const live = (hybrid: boolean) => goal(
    "live_pipeline", "live", hybrid ? "Grow dependable show revenue" : "Build a dependable paid-show pipeline", hybrid ? 3 : 10, hybrid ? "qualified opportunities" : "qualified buyers",
    "Run one focused booking-market sprint",
    "One market has a ready booking profile, qualified prospects, buyer contacts, and reviewed outreach.",
    ["Finish the booking profile and define what a good-fit show means", "Choose one target market and qualify real prospects", "Attach buyer contacts and prepare a reviewed pitch campaign"], now
  );
  const audience = () => goal(
    "audience_loop", "audience", "Grow a measurable core audience", 3, "measured experiments",
    "Build an audience loop around shows and releases",
    "Three small audience experiments have an owner, date, measure, and recorded result.",
    ["Choose one audience signal the band can measure consistently", "Design the first show or release audience-capture experiment", "Assign the next three audience experiments and review dates"], now
  );
  const showBusiness = () => goal(
    "show_business", "business", "Make every show financially visible", 1, "documented show process",
    "Create the band's repeatable show-business checklist",
    "The quote-to-settlement path names required terms, documents, payment checkpoints, expenses, and member payout review.",
    ["Write the minimum deal terms required before accepting a show", "Review the agreement, invoice, deposit, and cancellation workflow", "Define the post-show settlement and member payout checklist"], now
  );

  const goals = bandMode === "original"
    ? [release(), audience()]
    : bandMode === "cover_event"
      ? [live(false), showBusiness()]
      : [live(true), release()];
  return { version: MANAGER_PLAN_TEMPLATE_VERSION, bandMode, startsAt: now, endsAt: afterDays(now, 90), goals };
}

export function isManagerStarterPlanSourceKey(value: string | null | undefined) {
  return Boolean(value?.startsWith(`${MANAGER_PLAN_TEMPLATE_VERSION}:`));
}
