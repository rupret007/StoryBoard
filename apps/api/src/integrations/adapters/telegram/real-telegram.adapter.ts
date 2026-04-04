import type { TelegramSendMessageResult } from "./telegram.types";

const TELEGRAM_API = "https://api.telegram.org";

export async function telegramSendMessage(input: {
  botToken: string;
  chatId: string;
  text: string;
}): Promise<TelegramSendMessageResult> {
  const url = `${TELEGRAM_API}/bot${input.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true
    })
  });
  const data = (await res.json()) as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  };
  if (!res.ok || !data.ok) {
    const msg = data.description ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const messageId = data.result?.message_id ?? 0;
  return { mode: "real", messageId };
}
