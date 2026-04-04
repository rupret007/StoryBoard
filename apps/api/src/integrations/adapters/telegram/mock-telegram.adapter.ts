import type { TelegramSendMessageResult } from "./telegram.types";

export function telegramSendMessageMock(input: {
  chatId: string;
  text: string;
}): TelegramSendMessageResult {
  void input;
  return { mode: "mock", messageId: 0 };
}
