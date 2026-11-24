import type { ApiErrorBody, AuthResponse } from "./types";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"
).replace(/\/+$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send the access token and retry through /auth/refresh on 401. Defaults to true. */
  auth?: boolean;
};

// The access token lives in memory only. The refresh token is an httpOnly cookie
// the browser sends with `credentials: "include"`; no token touches localStorage.
let accessToken: string | null = null;
let refreshPromise: Promise<AuthResponse | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when a token refresh fails, so the session store can become anonymous. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers, auth = true } = options;
  const response = await send(path, { method, body, headers, auth });

  if (response.status === 401 && auth && !isPublicAuthPath(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return parse<T>(await send(path, { method, body, headers, auth }));
    }
    unauthorizedHandler?.();
  }

  return parse<T>(response);
}

/** Binary GET (downloads). Same 401 refresh contract as `request`, but returns a Blob. */
export async function requestBlob(path: string): Promise<Blob> {
  const response = await send(path, { method: "GET", auth: true });
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) return requestBlob(path);
    unauthorizedHandler?.();
  }
  if (!response.ok) throw await toApiError(response);
  return response.blob();
}

/** Exchange the httpOnly refresh cookie for a new access token. Single-flight per tab. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await send("/auth/refresh", { method: "POST", auth: false });
        if (!response.ok) {
          setAccessToken(null);
          return null;
        }
        const session = await parse<AuthResponse>(response);
        setAccessToken(session.accessToken);
        return session;
      } catch {
        setAccessToken(null);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function isPublicAuthPath(path: string): boolean {
  return (
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/register") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/set-password")
  );
}

async function send(path: string, options: Required<Pick<RequestOptions, "method" | "auth">> & RequestOptions): Promise<Response> {
  const { method, body, headers, auth } = options;
  const finalHeaders: Record<string, string> = { Accept: "application/json", ...headers };

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  if (auth && accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: payload,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Cannot reach the Lumina API. Check that the backend is running.",
    );
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  if (!response.ok) throw await toApiError(response);

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return payload as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  const error = (payload as ApiErrorBody | null)?.error;
  return new ApiError(
    response.status,
    error?.code ?? `HTTP_${response.status}`,
    error?.message ?? `Request failed with status ${response.status}`,
    error?.details,
  );
}
