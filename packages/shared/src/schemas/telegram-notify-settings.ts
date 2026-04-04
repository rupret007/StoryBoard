import { z } from "zod";

export const telegramNotifyCategoriesSchema = z.object({
  approvals: z.boolean(),
  overdueTasks: z.boolean(),
  staleFollowUps: z.boolean()
});

export type TelegramNotifyCategories = z.infer<
  typeof telegramNotifyCategoriesSchema
>;

export const defaultTelegramNotifyCategories: TelegramNotifyCategories = {
  approvals: false,
  overdueTasks: false,
  staleFollowUps: false
};

export function mergeTelegramNotifyCategories(
  stored: unknown | null | undefined
): TelegramNotifyCategories {
  if (stored == null) {
    return { ...defaultTelegramNotifyCategories };
  }
  const parsed = telegramNotifyCategoriesSchema.safeParse(stored);
  if (!parsed.success) {
    return { ...defaultTelegramNotifyCategories };
  }
  return { ...defaultTelegramNotifyCategories, ...parsed.data };
}

export const artistTelegramSettingsPatchSchema = z.object({
  telegramUrgentEnabled: z.boolean().optional(),
  telegramChatId: z.string().min(1).max(64).nullable().optional(),
  telegramNotifyCategories: telegramNotifyCategoriesSchema.partial().optional()
});

export type ArtistTelegramSettingsPatch = z.infer<
  typeof artistTelegramSettingsPatchSchema
>;
