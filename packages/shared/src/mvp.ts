export type MvpModule = {
  id: string;
  name: string;
  summary: string;
};

const MVP_MODULES: MvpModule[] = [
  {
    id: "venue-crm",
    name: "Venue CRM",
    summary: "Track venues, room details, preferences, and relationship history."
  },
  {
    id: "contact-crm",
    name: "Contact and Promoter CRM",
    summary: "Manage promoters, talent buyers, and the humans behind bookings."
  },
  {
    id: "booking-pipeline",
    name: "Booking Pipeline",
    summary: "Move opportunities from target to offer, hold, confirmed, and closed."
  },
  {
    id: "task-engine",
    name: "Task Engine",
    summary: "Create follow-ups, ownership, due dates, and coordination checklists."
  },
  {
    id: "approval-center",
    name: "Approval Center",
    summary: "Route risky outbound actions through explicit approval checkpoints."
  },
  {
    id: "command-bar",
    name: "Command Bar",
    summary: "Translate natural language into structured, auditable system actions."
  },
  {
    id: "weekly-summary",
    name: "Weekly Manager Summary",
    summary: "Aggregate key operational changes into a concise management digest."
  }
];

export function getMvpModules(): MvpModule[] {
  return MVP_MODULES;
}
