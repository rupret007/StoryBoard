import { z } from "zod";

const MAX_OPERATOR_HREF = 2000;

/**
 * Accept only http(s) links for operator-facing documents.
 * javascript:, data:, file:, and credentialed URLs fail closed.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    if (!url.hostname.trim()) return false;
    return value.trim().length <= MAX_OPERATOR_HREF;
  } catch {
    return false;
  }
}

export function sanitizeOperatorHref(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || !isSafeHttpUrl(trimmed)) return null;
  return trimmed;
}

export function sanitizeTelHref(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits || digits === "+") return null;
  return `tel:${digits}`;
}

export function sanitizeMailtoHref(value?: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.includes("\n") || trimmed.includes("\r")) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

export const safeHttpUrl = z
  .string()
  .trim()
  .min(1)
  .max(MAX_OPERATOR_HREF)
  .refine(isSafeHttpUrl, "Use an http(s) URL without credentials");

export const nullableSafeHttpUrl = safeHttpUrl.nullable().optional();
