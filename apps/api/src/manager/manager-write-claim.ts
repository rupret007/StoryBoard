import { CATALOG_BAND_OPS_IMPORT_HINT } from "@storyboard/shared";

export const MANAGER_WRITE_CLAIM_POLICY_VERSION = "manager_write_claim_v1" as const;

export const managerWriteClaimKinds = ["booking", "invoice", "catalog_import", "setlist"] as const;
export type ManagerWriteClaimKind = (typeof managerWriteClaimKinds)[number];

export type ManagerWriteClaimAssessment = {
  policyVersion: typeof MANAGER_WRITE_CLAIM_POLICY_VERSION;
  status: "not_write" | "refused";
  kind: ManagerWriteClaimKind | null;
  message: string | null;
};

const WRITE_CLAIM_MESSAGES: Record<ManagerWriteClaimKind, string> = {
  booking:
    "I did not book anyone or change a booking record. Manager chat is ops talk, not a silent writer. Confirm a gig from the Booking inbox or Approvals, or update the opportunity in Booking. Travis books, and StoryBoard will not auto-pitch.",
  invoice:
    "I did not create an invoice, record a payment, or settle a show. Open Band operations to issue an invoice, record a payment from real evidence, or settle a completed show. This chat reply is not a money write.",
  catalog_import: `I did not import or apply a catalog. Preview a local Vault app_api.json, then apply it in Band operations or with \`pnpm catalog:import --apply\`. ${CATALOG_BAND_OPS_IMPORT_HINT} A chat POST is talk only.`,
  setlist:
    "I did not save a setlist change. Edit the running order in Band operations → Music & setlists, then save it there. This conversation will not silently rewrite songs or setlists."
};

const FIRST_PERSON_COMPLETED_WRITE =
  /\bI (?:have |just )?(?:sent|emailed|contacted|scheduled|paid|signed|booked|invoiced|imported|published|uploaded|saved|created (?:a )?(?:calendar|invoice|setlist|booking)|recorded (?:a )?payment|applied (?:the )?(?:catalog|vault|import|setlist))\b/i;
const FIRST_PERSON_NEGATION = /\bI (?:did not|didn't|cannot|can't|won't|will not|have not|do not|don't)\b/i;
const COMPLETED_CATALOG_WRITE = /\b(?:catalog|songs) (?:(?:has|have) been|are now|is now) (?:imported|applied|saved)\b/i;
const COMPLETED_SETLIST_WRITE = /\bsetlist (?:has been|is now) (?:saved|updated|created|imported)\b/i;
const COMPLETED_INVOICE_WRITE = /\b(?:invoice (?:has been|is now) (?:created|issued|sent|saved|paid|voided)|(?:the )?invoice is now (?:paid|voided)|payment has been recorded)\b/i;
const COMPLETED_SETTLEMENT_WRITE = /\bsettlement (?:has been|is now) (?:created|finalized|saved)\b/i;
const COMPLETED_BOOKING_WRITE = /\b(?:venue|show|gig|buyer|opportunity) (?:has been|is now) booked\b/i;

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function notWrite(): ManagerWriteClaimAssessment {
  return { policyVersion: MANAGER_WRITE_CLAIM_POLICY_VERSION, status: "not_write", kind: null, message: null };
}

function refused(kind: ManagerWriteClaimKind): ManagerWriteClaimAssessment {
  return { policyVersion: MANAGER_WRITE_CLAIM_POLICY_VERSION, status: "refused", kind, message: WRITE_CLAIM_MESSAGES[kind] };
}

function looksLikeEducation(message: string) {
  return /\b(?:what(?:'s| is| does)|explain|define|meaning of|how does|how do|difference between|versus|\bvs\.?\b|should we|are we|is the|how is)\b/i.test(message);
}

export function managerWriteClaimMessage(kind: ManagerWriteClaimKind) {
  return WRITE_CLAIM_MESSAGES[kind];
}

function looksLikeInvoiceMoneyWrite(source: string) {
  if (/^(?:please\s+)?(?:create|issue|make|send|draft)\s+(?:an?\s+)?invoice\b/i.test(source)) return true;
  if (/^(?:please\s+)?invoice\b/i.test(source)) return true;
  if (/\b(?:record|log)\s+(?:a|the|this|that)?\s*payment\b/i.test(source)) return true;
  if (/\bmark\s+(?:invoice\b|.{0,40}\binvoice\b).{0,40}\b(?:paid|settled|void(?:ed)?)\b/i.test(source)) return true;
  if (/\b(?:void|write[- ]off)\b/i.test(source) && /\binvoice\b/i.test(source)) return true;
  if (/\bpay\b/i.test(source) && /\binvoice\b/i.test(source)) return true;
  if (/\b(?:create|finalize)\s+(?:an?\s+|the\s+|this\s+|that\s+)?settlement\b/i.test(source)) return true;
  if (/\bsettle\b/i.test(source) && /\b(?:show|gig|event|settlement)\b/i.test(source)) return true;
  return false;
}

export function resolveManagerWriteClaim(message: string): ManagerWriteClaimAssessment {
  const source = compact(message);
  if (!source || looksLikeEducation(source)) return notWrite();

  if (/\b(?:import|apply)\b/i.test(source) && /\b(?:catalog|songs?|vault|app_api|master_catalog|show night)\b/i.test(source)) {
    return refused("catalog_import");
  }

  if (/\bsetlists?\b/i.test(source) && /\b(?:save|update|edit|reorder|create|make|add|remove|delete)\b/i.test(source)) {
    return refused("setlist");
  }

  if (looksLikeInvoiceMoneyWrite(source)) return refused("invoice");

  if (
    /^(?:please\s+)?book\b/i.test(source)
    || /\b(?:book|confirm)\s+(?:the|this|that|them|it)\b/i.test(source)
    || /\bconfirm\s+(?:the|this|that)\s+booking\b/i.test(source)
    || /\bmark\b.{0,60}\bbooked\b/i.test(source)
    || /\b(?:apply|save)\s+(?:the\s+|this\s+|those\s+)?(?:reviewed\s+)?(?:booking\s+)?terms\b/i.test(source)
  ) {
    return refused("booking");
  }

  return notWrite();
}

export function managerAnswerClaimsUnverifiedWrite(answer: string) {
  for (const sentence of answer.split(/(?<=[.!?])\s+/)) {
    const text = compact(sentence);
    if (!text) continue;
    if (FIRST_PERSON_NEGATION.test(text)) continue;
    if (FIRST_PERSON_COMPLETED_WRITE.test(text)) return true;
    if (COMPLETED_CATALOG_WRITE.test(text) || COMPLETED_SETLIST_WRITE.test(text) || COMPLETED_INVOICE_WRITE.test(text) || COMPLETED_SETTLEMENT_WRITE.test(text) || COMPLETED_BOOKING_WRITE.test(text)) {
      return true;
    }
  }
  return false;
}
