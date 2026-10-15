/**
 * Talking to the shop's server: the same routes the web app's customer screens
 * call, with the login carried as `Authorization: Bearer` instead of a cookie.
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://escape-barbershop-demo.vercel.app").replace(/\/$/, "");

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by the sign-in state; every call after carries it. */
export function setApiToken(next: string | null) {
  token = next;
}

/** What to do when the server says the login is no longer good. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * A JSON call. Throws ApiError carrying the server's own message where it gave
 * one — those messages are written for customers, so they can be shown as is.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError((data && typeof data.error === "string" && data.error) || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}
