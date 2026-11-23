/**
 * Thin API client used to assert server state, not just what the UI shows.
 * The suite never mutates data through this module except notification state,
 * which is captured and restored by the notifications spec.
 */
export const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000/api/v1";
export const BACKEND_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, "");
export const SEEDED_PASSWORD = "Password123!";

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "teacher" | "student";
  status: string;
};

export type ApiLesson = {
  id: string;
  teacherId: string;
  studentId: string;
  date: string;
  time: string;
  endTime: string;
  title: string;
  status: string;
  cancelReason?: string;
  createdAt: string;
};

export type ApiRequest = {
  id: string;
  type: "slot-closure" | "lesson-cancellation";
  teacherId: string;
  lessonId?: string;
  reason: string;
  comment?: string;
  status: string;
  attachmentId?: string;
};

export type Bootstrap = {
  version: number;
  seededAt: string;
  collections: {
    users: Record<string, ApiUser>;
    lessons: Record<string, ApiLesson>;
    requests: Record<string, ApiRequest>;
  };
};

export type NotificationState = {
  mutedCategories: string[];
  readIds: string[];
  updatedAt?: string;
};

async function apiRequest<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${detail.slice(0, 200)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Backend session used for assertions; separate from the browser session. */
export async function apiLogin(email: string, password = SEEDED_PASSWORD): Promise<string> {
  const body = await apiRequest<{ accessToken: string }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!body.accessToken) throw new Error(`Login for ${email} returned no access token`);
  return body.accessToken;
}

export function apiGet<T>(path: string, token: string): Promise<T> {
  return apiRequest<T>(path, { token });
}

export function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", token, body });
}

export function apiPatch<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", token, body });
}

export type ApiCallResult<T> = { status: number; body: T };

/**
 * Non-throwing call for expected failures. `apiRequest` throws on any non-2xx
 * response, which hides the status a collision or credit assertion needs.
 */
export async function apiCall<T = unknown>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<ApiCallResult<T>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text().catch(() => "");
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body: body as T };
}

export type ApiSlot = {
  id: string;
  teacherId: string;
  date: string;
  time: string;
};

/** Opens a booking slot through the API (admin may name any teacher). */
export function openSlot(
  token: string,
  input: { teacherId?: string; date: string; time: string },
): Promise<ApiSlot> {
  return apiPost<ApiSlot>("/bookings/slots", token, input);
}

/** Open slots for one teacher in a date range. */
export function slotsFor(
  token: string,
  input: { teacherId: string; from: string; to: string },
): Promise<ApiSlot[]> {
  const query = new URLSearchParams(input).toString();
  return apiGet<ApiSlot[]>(`/bookings/slots?${query}`, token);
}

export function bootstrap(token: string): Promise<Bootstrap> {
  return apiGet<Bootstrap>("/school/bootstrap", token);
}

export function userByEmail(data: Bootstrap, email: string): ApiUser {
  const user = Object.values(data.collections.users).find(
    (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
  );
  if (!user) throw new Error(`Seeded user ${email} is missing from the school bootstrap`);
  return user;
}

export async function creditBalance(token: string, studentId: string): Promise<number> {
  const body = await apiGet<{ studentId: string; balance: number }>(
    `/credits/balance/${studentId}`,
    token,
  );
  return body.balance;
}

/**
 * Moves a student's ledger to `target` with one `adjustment` entry and returns
 * the balance it replaced. Specs that spend credits use this in `finally` so a
 * repeated run never drains the seeded account.
 */
export async function setCreditBalance(
  token: string,
  studentId: string,
  target: number,
): Promise<number> {
  const current = await creditBalance(token, studentId);
  const delta = Number((target - current).toFixed(2));
  if (delta !== 0) {
    await apiPost("/credits", token, {
      studentId,
      hours: delta,
      reason: "adjustment",
      description: "e2e balance restore",
    });
  }
  return current;
}

export function notificationState(token: string): Promise<NotificationState> {
  return apiGet<NotificationState>("/notifications/state", token);
}

export function saveNotificationState(
  token: string,
  patch: Partial<Pick<NotificationState, "mutedCategories" | "readIds">>,
): Promise<NotificationState> {
  return apiPatch<NotificationState>("/notifications/state", token, patch);
}

/**
 * The lesson a spec created, identified by the slot it booked. The shared dev DB
 * keeps residue from earlier runs at the same student/date/time key, so when
 * several rows match, the newest (`createdAt`) is the one this run created.
 */
export function lessonAt(
  data: Bootstrap,
  match: { studentId: string; date: string; time: string },
): ApiLesson {
  const matches = Object.values(data.collections.lessons).filter(
    (candidate) =>
      candidate.studentId === match.studentId &&
      candidate.date === match.date &&
      candidate.time === match.time,
  );
  if (matches.length === 0) {
    throw new Error(
      `No lesson found for student ${match.studentId} on ${match.date} at ${match.time}`,
    );
  }
  return matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Cancellation request whose comment carries this run's unique marker. */
export function cancellationRequestFor(
  data: Bootstrap,
  marker: string,
): ApiRequest {
  const request = Object.values(data.collections.requests).find(
    (candidate) =>
      candidate.type === "lesson-cancellation" && (candidate.comment ?? "").includes(marker),
  );
  if (!request) {
    throw new Error(`No lesson-cancellation request carrying marker ${marker}`);
  }
  return request;
}
