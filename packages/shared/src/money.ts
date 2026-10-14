export const MONEY_MINOR_MAX = 2_147_483_647;

export type ParseCurrencyToMinorResult =
  | { ok: true; amountMinor: number | null }
  | { ok: false; message: string };

export type ParseCurrencyToMinorOptions = {
  /** Empty input. Default `null` keeps optional money fields blank. */
  empty?: "null" | "reject";
  /** Inclusive minimum in cents. Default 0. */
  minMinor?: number;
};

const CURRENCY_INPUT = /^\d+(?:\.\d{1,2})?$/;

export const PARSE_CURRENCY_INVALID_MESSAGE =
  "Enter a non-negative amount with up to two decimal places. StoryBoard will not invent a figure.";
export const PARSE_CURRENCY_REQUIRED_MESSAGE = "Amount is required. StoryBoard will not invent a figure.";
export const PARSE_CURRENCY_MIN_MESSAGE = "Enter an amount greater than zero. StoryBoard will not invent a figure.";
export const PARSE_CURRENCY_RANGE_MESSAGE = "Enter an amount StoryBoard can record. StoryBoard will not invent a figure.";

export function parseCurrencyToMinor(
  value: string,
  options: ParseCurrencyToMinorOptions = {}
): ParseCurrencyToMinorResult {
  const trimmed = value.trim();
  if (trimmed === "") {
    return options.empty === "reject"
      ? { ok: false, message: PARSE_CURRENCY_REQUIRED_MESSAGE }
      : { ok: true, amountMinor: null };
  }
  if (!CURRENCY_INPUT.test(trimmed)) {
    return { ok: false, message: PARSE_CURRENCY_INVALID_MESSAGE };
  }
  const amountMinor = Math.round(Number(trimmed) * 100);
  const minMinor = options.minMinor ?? 0;
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MONEY_MINOR_MAX) {
    return { ok: false, message: PARSE_CURRENCY_RANGE_MESSAGE };
  }
  if (amountMinor < minMinor) {
    return { ok: false, message: minMinor > 0 ? PARSE_CURRENCY_MIN_MESSAGE : PARSE_CURRENCY_INVALID_MESSAGE };
  }
  return { ok: true, amountMinor };
}
