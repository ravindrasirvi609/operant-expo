import { cookies } from "next/headers";

export const VISITOR_COOKIE_NAME = "oe_visitor";
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Anonymous visitor identity, used to tell "your reservation" from "someone else's".
 *
 * Reservation holds had no owner at all, so the flow could not answer the most basic question a
 * visitor asks by reloading the page: is this stall still mine? The hold endpoint therefore demanded
 * status AVAILABLE and refused the very visitor who was holding it, locking them out for the rest
 * of the window.
 *
 * The value is 256 bits of randomness in an httpOnly cookie, and it is the credential rather than a
 * claim about one — so there is nothing to sign. Forging another visitor's id means guessing it, and
 * a hold is short-lived and reversible even then. It carries no personal data and no session
 * authority: it cannot authenticate anyone or reach organizer routes.
 */
export function newVisitorId() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

/** Shape shared by the two places a visitor id can be read from. */
type CookieReader = { get: (name: string) => { value: string } | undefined };

export function readVisitorIdFrom(store: CookieReader) {
  const value = store.get(VISITOR_COOKIE_NAME)?.value;
  // Reject anything that is not the shape this app issues, so a hand-set cookie cannot smuggle
  // odd values into a database query.
  return value && /^[a-f\d]{32,128}$/i.test(value) ? value : undefined;
}

/** Server-side read, for route handlers and server components. */
export async function readVisitorId() {
  return readVisitorIdFrom(await cookies());
}

export const visitorCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
};
