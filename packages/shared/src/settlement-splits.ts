export const SETTLEMENT_SPLIT_BASIS_POINTS = 10000;

export type SettlementSplitSpec = {
  bandMemberId: string;
  basisPoints: number;
};

export type AllocatedSettlementSplit = SettlementSplitSpec & {
  amountMinor: number;
};

/**
 * Equal split across `active: true` members only. Leftover basis points go to
 * the last active member so the total stays 10000.
 */
export function equalActiveMemberSplits(
  members: { id: string; active?: boolean | null }[]
): SettlementSplitSpec[] {
  const active = members.filter((member) => member.active === true);
  if (!active.length) return [];
  const base = Math.floor(SETTLEMENT_SPLIT_BASIS_POINTS / active.length);
  return active.map((member, index) => ({
    bandMemberId: member.id,
    basisPoints:
      index === active.length - 1
        ? SETTLEMENT_SPLIT_BASIS_POINTS - base * (active.length - 1)
        : base
  }));
}

/**
 * Floor each share, then give leftover cents to the largest basis-point share
 * (the last such split when tied) so amounts always sum to net.
 */
export function allocateSettlementSplits(
  netMinor: number,
  splits: SettlementSplitSpec[]
): AllocatedSettlementSplit[] {
  if (!splits.length) return [];
  const allocated = splits.map((split) => ({
    bandMemberId: split.bandMemberId,
    basisPoints: split.basisPoints,
    amountMinor: Math.floor((netMinor * split.basisPoints) / SETTLEMENT_SPLIT_BASIS_POINTS)
  }));
  const leftover = netMinor - allocated.reduce((sum, split) => sum + split.amountMinor, 0);
  if (leftover !== 0) {
    let target = 0;
    let maxBps = allocated[0]!.basisPoints;
    for (let index = 1; index < allocated.length; index += 1) {
      if (allocated[index]!.basisPoints >= maxBps) {
        maxBps = allocated[index]!.basisPoints;
        target = index;
      }
    }
    allocated[target]!.amountMinor += leftover;
  }
  return allocated;
}

export function settlementSnapshotBody(input: {
  currency: string;
  grossMinor: number;
  expenseMinor: number;
  netMinor: number;
  splits: { amountMinor: number; bandMember: { name: string; active?: boolean | null } }[];
}): string {
  const lines = input.splits
    .filter((split) => split.bandMember.active !== false)
    .map((split) => `${split.bandMember.name}: ${input.currency} ${(split.amountMinor / 100).toFixed(2)}`);
  return [
    `Gross: ${input.currency} ${(input.grossMinor / 100).toFixed(2)}`,
    `Expenses: ${input.currency} ${(input.expenseMinor / 100).toFixed(2)}`,
    `Net: ${input.currency} ${(input.netMinor / 100).toFixed(2)}`,
    "",
    ...lines
  ].join("\n");
}
