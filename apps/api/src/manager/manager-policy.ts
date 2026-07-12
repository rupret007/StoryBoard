export type ManagerActionRisk = "internal" | "approval_required" | "owner_approval_required" | "forbidden";

const INTERNAL_ACTIONS = new Set(["create_task", "create_decision", "update_task", "create_goal", "update_goal", "create_initiative", "update_initiative"]);
const APPROVAL_ACTIONS = new Set(["draft_email", "send_email", "calendar_write", "drive_write", "prepare_document"]);
const OWNER_ACTIONS = new Set(["activate_legal_template", "record_payment", "finalize_settlement", "legal_action", "financial_action"]);

/** Code-owned authorization boundary; model output can request but cannot redefine it. */
export function classifyManagerAction(actionType: string): ManagerActionRisk {
  if (INTERNAL_ACTIONS.has(actionType)) return "internal";
  if (APPROVAL_ACTIONS.has(actionType)) return "approval_required";
  if (OWNER_ACTIONS.has(actionType)) return "owner_approval_required";
  return "forbidden";
}

export function managerActionMayExecuteDirectly(actionType: string): boolean {
  return classifyManagerAction(actionType) === "internal";
}
