import {
  resolveSocialVoice,
  type SocialPlatform,
  type SocialVoiceKey
} from "./voice";

export type SocialAccountCheckInput = {
  artistName: string;
  artistVoice: SocialVoiceKey;
  accountLabel: string;
  accountVoice: SocialVoiceKey;
  accountExternalId?: string | null | undefined;
  platform: SocialPlatform;
};

export type SocialAccountCheckResult =
  | { ok: true }
  | { ok: false; reason: string; code: "voice_mismatch" | "cross_band_account" | "missing_account" };

const OTHER_BAND: Record<Exclude<SocialVoiceKey, "unknown">, RegExp> = {
  stalemate: /\brad\s*dad\b/i,
  rad_dad: /\bstalemate\b/i
};

/**
 * Refuse a send when the connected account does not belong to this band's voice.
 * Stalemate and Rad Dad must never cross.
 */
export function checkSocialAccountMatch(
  input: SocialAccountCheckInput
): SocialAccountCheckResult {
  if (!input.accountLabel.trim() && !input.accountExternalId?.trim()) {
    return {
      ok: false,
      code: "missing_account",
      reason: `No ${input.platform} account is connected for this band. Connect the account before sending.`
    };
  }

  const labelVoice = resolveSocialVoice(input.accountLabel);
  if (
    input.artistVoice !== "unknown" &&
    labelVoice !== "unknown" &&
    labelVoice !== input.artistVoice
  ) {
    return {
      ok: false,
      code: "cross_band_account",
      reason: `Account "${input.accountLabel}" looks like ${labelVoice}, not ${input.artistVoice}. Refusing send.`
    };
  }

  if (input.artistVoice !== "unknown") {
    const other = OTHER_BAND[input.artistVoice];
    if (other.test(input.accountLabel)) {
      return {
        ok: false,
        code: "cross_band_account",
        reason: `Account "${input.accountLabel}" names the other band. Refusing send.`
      };
    }
  }

  if (
    input.artistVoice !== "unknown" &&
    input.accountVoice !== "unknown" &&
    input.accountVoice !== input.artistVoice
  ) {
    return {
      ok: false,
      code: "voice_mismatch",
      reason: `Connected ${input.platform} account is bound to ${input.accountVoice}, but this workspace is ${input.artistVoice}. Refusing send.`
    };
  }

  if (
    input.artistVoice !== "unknown" &&
    input.accountVoice === "unknown" &&
    labelVoice === "unknown"
  ) {
    return {
      ok: false,
      code: "voice_mismatch",
      reason: `Connected ${input.platform} account is not bound to ${input.artistVoice}. Bind the account to this band before sending.`
    };
  }

  return { ok: true };
}

export function requireSocialAccountMatch(input: SocialAccountCheckInput): void {
  const result = checkSocialAccountMatch(input);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
