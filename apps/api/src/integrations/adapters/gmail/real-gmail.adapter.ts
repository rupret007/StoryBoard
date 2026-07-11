import { google } from "googleapis";
import type { GmailAdapter, GmailDraft, GmailThreadMessage } from "../adapter.types";

type GmailPart = { mimeType?: string | null; body?: { data?: string | null } | null; parts?: GmailPart[] | null };

function rfc822(draft: GmailDraft): string {
  const subject = draft.subject.replace(/\r?\n/g, " ").trim();
  const body = draft.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `To: ${draft.to.trim()}`,
    `Subject: ${subject}`,
    ...(draft.inReplyTo ? [`In-Reply-To: ${draft.inReplyTo}`, `References: ${draft.inReplyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body
  ].join("\r\n");
}

export class RealGmailAdapter implements GmailAdapter {
  readonly id = "gmail" as const;
  readonly mode = "real" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string
  ) {}

  async draftMessage(input: GmailDraft) {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const raw = Buffer.from(rfc822(input), "utf8").toString("base64url");
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } }
    });
    const draftId = res.data.id ?? "unknown";
    const preview = `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`;
    return { draftId, messageId: res.data.message?.id ?? undefined, threadId: res.data.message?.threadId ?? undefined, preview };
  }

  async sendMessage(input: GmailDraft): Promise<{ messageId: string; threadId?: string | undefined; preview: string }> {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const raw = Buffer.from(rfc822(input), "utf8").toString("base64url");
    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw, ...(input.threadId ? { threadId: input.threadId } : {}) } });
    return {
      messageId: res.data.id ?? "unknown",
      threadId: res.data.threadId ?? undefined,
      preview: `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`
    };
  }

  async getTrackedThread(threadId: string): Promise<GmailThreadMessage[]> {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const userEmail = profile.data.emailAddress?.toLowerCase();
    const result = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    const header = (headers: { name?: string | null; value?: string | null }[] | undefined, name: string) =>
      headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
    const bodyText = (part: GmailPart | null | undefined): string | undefined => {
      if (part?.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
      for (const child of part?.parts ?? []) { const found = bodyText(child); if (found) return found; }
      return undefined;
    };
    return (result.data.messages ?? []).flatMap((message): GmailThreadMessage[] => {
      if (!message.id || !message.threadId) return [];
      const headers = message.payload?.headers;
      const from = header(headers, "From") ?? "";
      const match = from.match(/^(?:\s*"?([^"<]+)"?\s*)?<([^>]+)>$/);
      const fromEmail = (match?.[2] ?? from).trim().toLowerCase();
      return [{
        messageId: message.id,
        threadId: message.threadId,
        ...(header(headers, "Message-ID") ? { rfcMessageId: header(headers, "Message-ID") } : {}),
        fromEmail,
        ...(match?.[1]?.trim() ? { fromName: match[1].trim() } : {}),
        ...(header(headers, "Subject") ? { subject: header(headers, "Subject") } : {}),
        ...(message.snippet ? { snippet: message.snippet.slice(0, 500) } : {}),
        ...(bodyText(message.payload) ? { bodyText: bodyText(message.payload) } : {}),
        receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
        isFromUser: Boolean(userEmail && fromEmail === userEmail)
      }];
    });
  }
}
