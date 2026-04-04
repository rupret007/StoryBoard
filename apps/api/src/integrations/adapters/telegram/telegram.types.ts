export type TelegramAdapterMode = "real" | "mock";

export type TelegramSendMessageResult = {
  mode: TelegramAdapterMode;
  messageId: number;
};
