export function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:4000"
  );
}

export type ApiFetchInit = Omit<RequestInit, "body"> & {
  body?: RequestInit["body"];
  json?: unknown;
  /** Sent as `x-artist-id` when set */
  artistId?: string;
};

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: ApiFetchInit
): Promise<T> {
  const base = apiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const {
    json,
    headers: initHeaders,
    body: initBody,
    artistId,
    ...rest
  } = init ?? {};
  const headers = new Headers(initHeaders);
  if (artistId?.trim()) {
    headers.set("x-artist-id", artistId.trim());
  }
  let body: BodyInit | null | undefined = initBody;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  const fetchInit: RequestInit = {
    ...rest,
    headers,
    credentials: "include"
  };
  if (body !== undefined && body !== null) {
    fetchInit.body = body;
  } else if (body === null) {
    fetchInit.body = null;
  }
  const res = await fetch(url, fetchInit);
  if (!res.ok) {
    const text = await res.text();
    throw new ApiHttpError(res.status, text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
