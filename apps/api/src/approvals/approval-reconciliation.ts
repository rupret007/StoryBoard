import { z } from "zod";

export const APPROVAL_RECONCILIATION_POLICY_VERSION =
  "approval_reconciliation_v1" as const;

export const APPROVAL_RECONCILIATION_OUTCOMES = [
  "still_unknown",
  "external_effect_observed",
  "no_external_effect_observed"
] as const;

export const APPROVAL_RECONCILIATION_CONCLUSIVE_OUTCOMES = [
  "external_effect_observed",
  "no_external_effect_observed"
] as const;

const CREDENTIAL_VALUE =
  /(?:\b(?:api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|authorization|password|passwd|oauth[_ -]?code)\s*[:=]\s*\S+|[?&](?:access_token|refresh_token|client_secret|api_key|token|code|signature|x-amz-signature)=[^&\s]+|\bya29\.[A-Za-z0-9._-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^/\s:@]+:[^/\s@]+@)/i;

export type ApprovalReconciliationOutcome =
  (typeof APPROVAL_RECONCILIATION_OUTCOMES)[number];

export const approvalReconciliationInputSchema = z
  .object({
    outcome: z.enum(APPROVAL_RECONCILIATION_OUTCOMES),
    note: z.string().trim().min(10).max(2000),
    checkedLocation: z.string().trim().min(2).max(300),
    providerReference: z.string().trim().min(1).max(500).nullable().optional(),
    observedAt: z.string().datetime({ offset: true }),
    idempotencyKey: z.string().uuid()
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.outcome === "external_effect_observed" &&
      !input.providerReference
    ) {
      context.addIssue({
        code: "custom",
        path: ["providerReference"],
        message:
          "A provider reference is required when an external effect was observed"
      });
    }
    for (const [field, value] of [
      ["note", input.note],
      ["checkedLocation", input.checkedLocation],
      ["providerReference", input.providerReference ?? ""]
    ] as const) {
      if (CREDENTIAL_VALUE.test(value)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Do not store credentials or access tokens in reconciliation evidence"
        });
      }
    }
  });

export type ApprovalReconciliationInput = z.infer<
  typeof approvalReconciliationInputSchema
>;

export type ApprovalReconciliationSource = {
  id: string;
  outcome: string;
  resolutionKey: string | null;
  note: string;
  evidence: unknown;
  idempotencyKey: string;
  policyVersion: string;
  observedAt: Date;
  actorLabel: string | null;
  actorOperatorId: string | null;
  createdAt: Date;
};

export type ApprovalReconciliationEvidence = {
  checkedLocation: string;
  providerReference: string | null;
};

export type ApprovalKnownEffectSource = {
  actionType: string;
  payload?: unknown;
  campaignDeliveries?: readonly {
    status: string;
    providerDraftId?: string | null;
    providerMessageId?: string | null;
    providerThreadId?: string | null;
  }[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function resultRows(
  result: Record<string, unknown>,
  key: "drafts" | "sent" | "holds"
): Record<string, unknown>[] {
  const value = result[key];
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const row = record(item);
        return row ? [row] : [];
      })
    : [];
}

/**
 * Detects provider effects already proven by StoryBoard's own persisted result
 * fields. It is deliberately narrow: absence is not proof that nothing
 * happened, while a positive match makes a contradictory no-effect receipt
 * unsafe.
 */
export function approvalReconciliationHasKnownExternalEffect(
  approval: ApprovalKnownEffectSource
): boolean {
  const payload = record(approval.payload);
  const result = record(payload?.executionResult);
  const simulated =
    result?.gmailMode === "mock" ||
    result?.calendarMode === "mock" ||
    result?.driveMode === "mock";

  if (!simulated) {
    if (
      approval.campaignDeliveries?.some(
        (delivery) =>
          delivery.status === "drafted" ||
          delivery.status === "sent" ||
          nonEmpty(delivery.providerDraftId) ||
          nonEmpty(delivery.providerMessageId) ||
          nonEmpty(delivery.providerThreadId)
      )
    ) {
      return true;
    }
    if (result) {
      if (
        resultRows(result, "drafts").some(
          (row) =>
            nonEmpty(row.draftId) ||
            nonEmpty(row.messageId) ||
            nonEmpty(row.threadId)
        )
      ) {
        return true;
      }
      if (
        resultRows(result, "sent").some(
          (row) =>
            row.status === "sent" ||
            nonEmpty(row.messageId) ||
            nonEmpty(row.threadId)
        )
      ) {
        return true;
      }
      if (
        resultRows(result, "holds").some(
          (row) => nonEmpty(row.eventId) || nonEmpty(row.htmlLink)
        )
      ) {
        return true;
      }
      if (nonEmpty(result.folderId) || nonEmpty(result.webViewLink)) {
        return true;
      }
    }
  }
  return false;
}

export function approvalReconciliationIsConclusive(
  outcome: string | null | undefined
): outcome is Exclude<ApprovalReconciliationOutcome, "still_unknown"> {
  return (
    outcome === "external_effect_observed" ||
    outcome === "no_external_effect_observed"
  );
}

export function latestApprovalReconciliation<
  T extends Pick<ApprovalReconciliationSource, "createdAt">
>(reconciliations: readonly T[] | null | undefined): T | null {
  if (!reconciliations?.length) return null;
  return [...reconciliations].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  )[0]!;
}

export function terminalApprovalReconciliation<
  T extends Pick<ApprovalReconciliationSource, "outcome" | "createdAt">
>(reconciliations: readonly T[] | null | undefined): T | null {
  return latestApprovalReconciliation(
    reconciliations?.filter((row) =>
      approvalReconciliationIsConclusive(row.outcome)
    )
  );
}

export function approvalReconciliationEvidence(
  input: ApprovalReconciliationInput
): ApprovalReconciliationEvidence {
  return {
    checkedLocation: input.checkedLocation,
    providerReference: input.providerReference ?? null
  };
}

export function approvalReconciliationIntentMatches(
  row: Pick<
    ApprovalReconciliationSource,
    "outcome" | "note" | "evidence" | "observedAt"
  >,
  input: ApprovalReconciliationInput
) {
  const evidence = row.evidence as Partial<ApprovalReconciliationEvidence>;
  return (
    row.outcome === input.outcome &&
    row.note === input.note &&
    row.observedAt.toISOString() === new Date(input.observedAt).toISOString() &&
    evidence?.checkedLocation === input.checkedLocation &&
    (evidence?.providerReference ?? null) ===
      (input.providerReference ?? null)
  );
}
