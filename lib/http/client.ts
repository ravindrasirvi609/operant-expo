/**
 * Every dashboard/public page fetches JSON from our own API routes and expects an
 * `{ error }` shape on failure. A route can fail before it ever produces a JSON body —
 * an unhandled exception, a proxy/timeout truncation, a DB outage — leaving the response
 * body empty or non-JSON. `response.json()` then throws, and callers that don't catch it
 * are left with a stuck "Saving…" button forever. Route every client-side fetch through
 * this helper instead of calling `response.json()` directly.
 */
export async function parseJsonResponse<T extends { error?: string } = { error?: string }>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return { error: response.ok ? "Received an unexpected response from the server." : `Request failed (${response.status}). Please try again.` } as T;
  }
}
