import type { ApiErrorBody } from "@/lib/http/responses";

export type ApiSuccess<T> = { ok: true; status: number; data: T };

export type ApiFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  /** Serialised as a JSON body with the correct content type. Ignored when `body` is set. */
  json?: unknown;
  /** Raw body for multipart uploads and other non-JSON payloads. */
  body?: RequestInit["body"];
  /** Sent as the `Idempotency-Key` header. Required by the public booking endpoint. */
  idempotencyKey?: string;
};

/** Fallback sentences for responses that carry no usable JSON body of their own. */
function statusMessage(status: number) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find what you're looking for.";
  if (status === 409) return "That conflicts with a change someone else just made. Reload and try again.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our end. Please try again.";
  return `Request failed (${status}). Please try again.`;
}

/**
 * The one way this app talks to its own API.
 *
 * Every caller previously did some variation of `await response.json()` — 16 sites did it with
 * no guard at all. A route that fails before producing JSON (an unhandled throw, a proxy
 * truncation, an HTML error page, a dropped connection) made `.json()` throw inside a handler
 * that never caught it, leaving buttons stuck on "Saving…" forever with nothing on screen.
 *
 * This never throws. It always resolves to a discriminated result, so a caller writes:
 *
 *   const result = await apiRequest<{ stall: Stall }>(url, { method: "POST", json: values });
 *   if (!result.ok) { toast.error(result.error); applyFieldErrors(result.fieldErrors); return; }
 *   setStall(result.data.stall);
 *
 * Network failures surface as status 0, which is how a caller distinguishes "offline" from
 * "the server said no".
 */
export async function apiRequest<T>(url: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
  const { json, idempotencyKey, headers, ...rest } = init;

  const requestHeaders = new Headers(headers);
  let body = rest.body;
  if (json !== undefined && body === undefined) {
    body = JSON.stringify(json);
    if (!requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  }
  if (idempotencyKey) requestHeaders.set("Idempotency-Key", idempotencyKey);

  let response: Response;
  try {
    response = await fetch(url, { ...rest, body, headers: requestHeaders });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "Couldn't reach the server. Check your connection and try again.",
      code: "NETWORK_ERROR",
    };
  }

  if (response.status === 204) {
    return { ok: true, status: 204, data: undefined as T };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A body that isn't JSON tells us nothing beyond the status line.
    return response.ok
      ? { ok: true, status: response.status, data: undefined as T }
      : { ok: false, status: response.status, error: statusMessage(response.status) };
  }

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ApiErrorBody;
    return {
      ok: false,
      status: response.status,
      error: errorBody.error ?? statusMessage(response.status),
      ...(errorBody.code ? { code: errorBody.code } : {}),
      ...(errorBody.fieldErrors ? { fieldErrors: errorBody.fieldErrors } : {}),
      ...(errorBody.formErrors ? { formErrors: errorBody.formErrors } : {}),
    };
  }

  // A 2xx that still carries `{ error }` — older routes did this. Treat it as a failure so a
  // caller can never mistake it for success.
  const maybeError = (payload as ApiErrorBody | null)?.error;
  if (typeof maybeError === "string" && maybeError.length > 0) {
    return { ok: false, status: response.status, error: maybeError };
  }

  return { ok: true, status: response.status, data: payload as T };
}

/** Convenience wrapper for reads, so call sites don't repeat `{ method: "GET" }`. */
export function apiGet<T>(url: string, init: ApiRequestInit = {}) {
  return apiRequest<T>(url, { ...init, method: "GET" });
}
