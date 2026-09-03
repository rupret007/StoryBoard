export const BOOKING_TERMS_APPLY_POLICY_VERSION = "booking_terms_apply_v1" as const;

export type ExistingBookingTerms = {
  targetDate: Date | string | null;
  proposedFeeMinor: number | null;
  proposedCurrency: string | null;
  negotiationConditions: string | null;
};

export type ProposedBookingTerms = {
  proposedDate: Date | string | null;
  proposedFeeMinor: number | null;
  proposedCurrency: string | null;
  materialConditions: string | null;
};

function keepRecordedTerm<T>(proposed: T | null | undefined, existing: T): T {
  if (proposed == null) return existing;
  if (typeof proposed === "string" && proposed.trim() === "") return existing;
  return proposed;
}

/**
 * Merge reviewed reply facts onto an opportunity without erasing recorded
 * money or conditions when analysis left a field null or blank.
 */
export function mergeAppliedBookingTerms(
  existing: ExistingBookingTerms,
  proposed: ProposedBookingTerms
): ExistingBookingTerms {
  return {
    targetDate: keepRecordedTerm(proposed.proposedDate, existing.targetDate),
    proposedFeeMinor: proposed.proposedFeeMinor ?? existing.proposedFeeMinor,
    proposedCurrency: keepRecordedTerm(proposed.proposedCurrency, existing.proposedCurrency),
    negotiationConditions: keepRecordedTerm(proposed.materialConditions, existing.negotiationConditions)
  };
}
