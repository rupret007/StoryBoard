import { google } from "googleapis";
import type { DriveFileRef, GoogleDriveAdapter } from "../adapter.types";

function escapeDriveQueryName(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class RealGoogleDriveAdapter implements GoogleDriveAdapter {
  readonly id = "google-drive" as const;
  readonly mode = "real" as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly rootFolderId?: string
  ) {}

  private auth() {
    const oauth2 = new google.auth.OAuth2(this.clientId, this.clientSecret);
    oauth2.setCredentials({ refresh_token: this.refreshToken });
    return oauth2;
  }

  async uploadDraftMeta(input: DriveFileRef) {
    const drive = google.drive({ version: "v3", auth: this.auth() });
    const res = await drive.files.create({
      requestBody: {
        name: input.name,
        mimeType: input.mimeType,
        ...(this.rootFolderId ? { parents: [this.rootFolderId] } : {})
      },
      fields: "id, webViewLink"
    });
    return {
      fileId: res.data.id ?? "unknown",
      viewUrl: res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view`
    };
  }

  async ensureStoryboardFolder(folderName: string) {
    const drive = google.drive({ version: "v3", auth: this.auth() });
    const safeName = escapeDriveQueryName(folderName);
    const parent = this.rootFolderId ?? undefined;
    const parentClause = parent
      ? `'${parent}' in parents and `
      : `'root' in parents and `;
    const q = `name='${safeName}' and ${parentClause}mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const existing = await drive.files.list({
      q,
      fields: "files(id, webViewLink)",
      pageSize: 5
    });
    const hit = existing.data.files?.[0];
    if (hit?.id) {
      return {
        folderId: hit.id,
        webViewLink: hit.webViewLink ?? null
      };
    }
    const created = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        ...(this.rootFolderId ? { parents: [this.rootFolderId] } : {})
      },
      fields: "id, webViewLink"
    });
    return {
      folderId: created.data.id ?? "unknown",
      webViewLink: created.data.webViewLink ?? null
    };
  }

  async listFolderFiles(folderId: string) {
    const drive = google.drive({ version: "v3", auth: this.auth() });
    const res = await drive.files.list({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`,
      fields: "files(id, name, webViewLink)",
      pageSize: 25
    });
    return (res.data.files ?? []).map((f) => ({
      id: f.id ?? "",
      name: f.name ?? "",
      webViewLink: f.webViewLink ?? null
    }));
  }
}
