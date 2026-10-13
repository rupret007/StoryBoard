export const PARSE_COUNT_INVALID_MESSAGE =
  "Enter a whole number. StoryBoard will not invent a count.";

export type ParseCountResult =
  | { ok: true; value: number | null }
  | { ok: false; message: string };

export function parseCount(value: string): ParseCountResult {
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false, message: PARSE_COUNT_INVALID_MESSAGE };
  const count = Number(trimmed);
  if (!Number.isSafeInteger(count) || count < 0) return { ok: false, message: PARSE_COUNT_INVALID_MESSAGE };
  return { ok: true, value: count };
}
