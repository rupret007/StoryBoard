export function shouldSkipSocialTargetSend(current: {
  externalPostId?: string | null | undefined;
}): boolean {
  return Boolean(current.externalPostId?.trim());
}

/** A later failed or refused attempt must not erase a platform id that already landed. */
export function preserveSocialTargetPostId(
  currentId: string | null | undefined,
  sentId: string | null | undefined
): string | null {
  const current = currentId?.trim();
  if (current) return current;
  const sent = sentId?.trim();
  return sent || null;
}
