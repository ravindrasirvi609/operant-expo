import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * The single JSON error shape every API route returns.
 *
 * Before this existed, routes returned bare `{ error }` strings, per-field Zod detail under
 * three different key names, or — when a permission check called `notFound()` — Next's HTML
 * 404 page with no JSON at all. Clients had no reliable way to tell "you typed a bad email"
 * apart from "you lack permission" apart from "the database is down", so every failure
 * surfaced as the same unhelpful sentence.
 *
 * - `error`       — a human-readable sentence safe to show a user verbatim.
 * - `code`        — a stable machine token for client branching. Never localise or reword it.
 * - `fieldErrors` — dotted form paths to messages, e.g. `{ "geometry.x": ["..."] }`, ready to
 *                   feed straight into react-hook-form's `setError`.
 * - `formErrors`  — validation failures that belong to the object as a whole, not one field
 *                   (a Zod `.refine` on the root, for instance).
 */
export type ApiErrorBody = {
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  formErrors?: string[];
};

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * Flattens a ZodError into dotted field paths.
 *
 * Zod's own `flattenError` collapses every nested issue onto its *first* path segment, so
 * `geometry.width` and `geometry.x` both arrive as `geometry` and the caller cannot tell which
 * input to highlight. react-hook-form addresses fields by dotted path, so we build that
 * instead. Array indices become bracket notation (`amenities[2]`) to match RHF's own naming.
 */
export function toFieldErrors(error: ZodError): {
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
} {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      formErrors.push(issue.message);
      continue;
    }
    const path = issue.path.reduce<string>((accumulated, segment) => {
      if (typeof segment === "number") return `${accumulated}[${segment}]`;
      return accumulated ? `${accumulated}.${String(segment)}` : String(segment);
    }, "");
    (fieldErrors[path] ??= []).push(issue.message);
  }

  return { fieldErrors, formErrors };
}

/**
 * Builds the user-facing sentence for a validation failure. Prefers a root-level `.refine`
 * message (which is usually written for humans, e.g. "End date must be on or after start
 * date") over a generic fallback, so the most meaningful message is the one shown.
 */
function validationSummary(
  fieldErrors: Record<string, string[]>,
  formErrors: string[],
  fallback: string,
) {
  if (formErrors.length > 0) return formErrors[0];
  const fields = Object.keys(fieldErrors);
  if (fields.length === 1) return `${fields[0]}: ${fieldErrors[fields[0]][0]}`;
  if (fields.length > 1) return `${fallback} Check ${fields.length} highlighted fields.`;
  return fallback;
}

export function ok<T>(data: T) {
  return NextResponse.json(data satisfies T, { status: 200 });
}

export function created<T>(data: T) {
  return NextResponse.json(data satisfies T, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/** 400 — the request body or params were malformed. */
export function badRequest(
  error: ZodError | string,
  fallback = "Some of the details you entered aren't valid.",
) {
  if (typeof error === "string") {
    return NextResponse.json<ApiErrorBody>(
      { error, code: "VALIDATION_FAILED" },
      { status: 400 },
    );
  }
  const { fieldErrors, formErrors } = toFieldErrors(error);
  return NextResponse.json<ApiErrorBody>(
    {
      error: validationSummary(fieldErrors, formErrors, fallback),
      code: "VALIDATION_FAILED",
      fieldErrors,
      ...(formErrors.length > 0 ? { formErrors } : {}),
    },
    { status: 400 },
  );
}

/** 401 — no valid session. The client should send the visitor to sign in. */
export function unauthorizedJson(error = "Please sign in to continue.") {
  return NextResponse.json<ApiErrorBody>({ error, code: "UNAUTHENTICATED" }, { status: 401 });
}

/** 403 — authenticated, a member, but the role lacks this permission. */
export function forbiddenJson(error = "You don't have permission to do that.") {
  return NextResponse.json<ApiErrorBody>({ error, code: "FORBIDDEN" }, { status: 403 });
}

/** 404 — no such resource, or the caller may not know it exists. */
export function notFoundJson(error = "We couldn't find what you're looking for.") {
  return NextResponse.json<ApiErrorBody>({ error, code: "NOT_FOUND" }, { status: 404 });
}

/**
 * 409 — the request was valid but conflicts with current state (already held, already booked,
 * duplicate slug).
 *
 * `fieldErrors` is optional but worth supplying whenever the conflict is attributable to one
 * input: a duplicate organization slug reported against `slug` highlights the offending box,
 * where a bare sentence leaves the user hunting for it.
 */
export function conflict(
  error: string,
  code = "CONFLICT",
  fieldErrors?: Record<string, string[]>,
) {
  return NextResponse.json<ApiErrorBody>(
    { error, code, ...(fieldErrors ? { fieldErrors } : {}) },
    { status: 409 },
  );
}

/**
 * 422 — well-formed and non-conflicting, but not allowed in the resource's current state.
 * Used for lifecycle rules such as "booking isn't open for this exhibition yet", which are
 * distinct from a 409 race and must not be reported as one.
 */
export function unprocessable(error: string, code = "UNPROCESSABLE") {
  return NextResponse.json<ApiErrorBody>({ error, code }, { status: 422 });
}

export function tooManyRequests(error = "Too many requests. Please try again shortly.") {
  return NextResponse.json<ApiErrorBody>({ error, code: "RATE_LIMITED" }, { status: 429 });
}

/**
 * 500 — logs the real cause server-side and returns a fixed public sentence.
 *
 * Routes previously did `error instanceof Error ? error.message : "..."`, which published
 * internal failure text (including driver and transaction messages) to anonymous callers.
 * The cause belongs in the server log; the caller gets nothing exploitable.
 */
export function serverError(
  cause: unknown,
  context: string,
  error = "Something went wrong on our end. Please try again.",
) {
  console.error(`[api] ${context}:`, cause);
  return NextResponse.json<ApiErrorBody>({ error, code: "INTERNAL_ERROR" }, { status: 500 });
}
