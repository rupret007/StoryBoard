import { google } from "googleapis";
import type { GmailAdapter, GmailDraft } from "../adapter.types";

function rfc822(draft: GmailDraft): string {
  const subject = draft.subject.replace(/\r?\n/g, " ").trim();
  const body = draft.body.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return [
    `To: ${draft.to.trim()}`,
    `Subject: ${subject}`,
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
      requestBody: { message: { raw } }
    });
    const draftId = res.data.id ?? "unknown";
    const preview = `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`;
    return { draftId, preview };
  }

  async sendMessage(input: GmailDraft): Promise<{ messageId: string; preview: string }> {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const raw = Buffer.from(rfc822(input), "utf8").toString("base64url");
    const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return {
      messageId: res.data.id ?? "unknown",
      preview: `To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`
    };
  }
}
