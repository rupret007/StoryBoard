export type ManagerActionRisk = "internal" | "approval_required" | "owner_approval_required" | "forbidden";

const INTERNAL_ACTIONS = new Set(["create_task", "create_conversation_task", "update_conversation_task", "assign_conversation_task", "create_conversation_project", "create_conversation_event", "update_conversation_event_availability", "create_decision", "generate_event_advance", "generate_project_plan", "remember_fact", "assign_task", "update_profile_context", "update_task", "create_goal", "update_goal", "create_initiative", "update_initiative"]);
const APPROVAL_PREPARATION_ACTIONS = new Set(["prepare_event_logistics_approvals"]);
const APPROVAL_ACTIONS = new Set(["draft_email", "send_email", "calendar_write", "drive_write", "prepare_document"]);
const OWNER_ACTIONS = new Set(["activate_legal_template", "record_payment", "finalize_settlement", "legal_action", "financial_action"]);

/** Code-owned authorization boundary; model output can request but cannot redefine it. */
export function classifyManagerAction(actionType: string): ManagerActionRisk {
  if (INTERNAL_ACTIONS.has(actionType)) return "internal";
  if (APPROVAL_PREPARATION_ACTIONS.has(actionType) || APPROVAL_ACTIONS.has(actionType)) return "approval_required";
  if (OWNER_ACTIONS.has(actionType)) return "owner_approval_required";
  return "forbidden";
}

export function managerActionMayExecuteDirectly(actionType: string): boolean {
  return classifyManagerAction(actionType) === "internal";
}

/** Preparing a typed approval is an internal write; provider execution remains separately approved. */
export function managerActionMayPrepareApproval(actionType: string): boolean {
  return APPROVAL_PREPARATION_ACTIONS.has(actionType);
}
