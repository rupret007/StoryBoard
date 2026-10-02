import { operatorApiErrorMessage } from "@storyboard/shared";
import { cookies } from "next/headers";
import {
  apiBaseUrl,
  ApiHttpError,
  type ApiFetchInit
} from "./api";

export { ApiHttpError };

/** Resolve once before loading a workspace so its reads, role and later browser
 * writes all use the same band. Missing access is an error, never a default ID. */
export async function serverBandAccess() {
  const me = await serverApiFetch<{
    currentArtistId: string | null;
    memberships: { artistId: string; role: string }[];
  }>("/auth/me", { cache: "no-store" });
  const membership = me.memberships.find((row) => row.artistId === me.currentArtistId) ?? me.memberships[0];
  if (!membership) throw new Error("Your band could not be verified. Reload this page before trying again.");
  const canManage = membership.role === "owner" || membership.role === "member";
  const accessState: "manage" | "read_only" | "unavailable" = canManage ? "manage" : membership.role === "viewer" ? "read_only" : "unavailable";
  return { artistId: membership.artistId, role: membership.role, canManage, isOwner: membership.role === "owner", accessState };
}

/**
 * Forward the browser cookie jar to the StoryBoard API during RSC fetches
 * so session auth works on the server.
 */
export async function serverApiFetch<T>(
  path: string,
  init?: ApiFetchInit
): Promise<T> {
  const jar = await cookies();
  const pairs = jar.getAll();
  const cookieHeader =
    pairs.length > 0 ? pairs.map((c) => `${c.name}=${c.value}`).join("; ") : "";
  const {
    json,
    body: initBody,
    artistId,
    headers: initHeaders,
    ...rest
  } = init ?? {};
  const headers = new Headers(initHeaders);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }
  if (artistId?.trim()) {
    headers.set("x-artist-id", artistId.trim());
  }
  const webUrl = process.env.WEB_URL;
  if (webUrl) {
    try {
      headers.set("Origin", new URL(webUrl).origin);
    } catch {
      /* ignore */
    }
  }
  const base = apiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let body: BodyInit | null | undefined = initBody;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const requestInit: RequestInit = {
    ...rest,
    headers,
    credentials: "include"
  };
  if (body !== undefined) {
    requestInit.body = body ?? null;
  }
  const res = await fetch(url, requestInit);
  if (!res.ok) {
    const text = await res.text();
    throw new ApiHttpError(
      res.status,
      operatorApiErrorMessage(text, `${res.status} ${res.statusText}`)
    );
  }
  return res.json() as Promise<T>;
}
