import { notFound, unauthorized } from "next/navigation";

import { resolveOrganizationContext, type OrganizationContext } from "@/lib/auth/tenant";
import { roleHasPermission } from "@/lib/permissions";
import { forbiddenJson, notFoundJson, unauthorizedJson } from "@/lib/http/responses";

/* ---------------------------------------------------------------------------
   Page guards — these throw Next.js navigation errors and render UI. They must
   only be called from Server Components, never from a Route Handler.
   --------------------------------------------------------------------------- */

export async function requireOrganizationContext(organizationId: string) {
  const resolution = await resolveOrganizationContext(organizationId);
  if (!resolution.ok) {
    if (resolution.reason === "UNAUTHENTICATED") unauthorized();
    notFound();
  }
  return resolution.context;
}

export async function requireOrganizationPermission(organizationId: string, permission: string) {
  const context = await requireOrganizationContext(organizationId);
  if (!roleHasPermission(context.membership.role, permission)) notFound();
  return context;
}

/* ---------------------------------------------------------------------------
   API guard.
   --------------------------------------------------------------------------- */

export type ApiAuthResult =
  | { ok: true; context: OrganizationContext }
  | { ok: false; response: Response };

/**
 * Permission guard for Route Handlers. Returns a JSON error response instead of throwing.
 *
 * The page guards above call `notFound()`, which — per the Next.js docs — "serves a 404 to the
 * caller" when invoked in a Route Handler. Using them in an API route therefore answered every
 * permission problem with a bodyless 404 that clients rendered as "Request failed (404)". This
 * returns the correct status with a parseable body instead:
 *
 *   not signed in            -> 401 UNAUTHENTICATED
 *   signed in, not a member  -> 404 NOT_FOUND      (does not leak that the org exists)
 *   member, wrong role       -> 403 FORBIDDEN
 *
 * Usage:
 *   const auth = await requireApiPermission(organizationId, "map:edit");
 *   if (!auth.ok) return auth.response;
 */
export async function requireApiPermission(
  organizationId: string,
  permission: string,
): Promise<ApiAuthResult> {
  const resolution = await resolveOrganizationContext(organizationId);

  if (!resolution.ok) {
    if (resolution.reason === "UNAUTHENTICATED") return { ok: false, response: unauthorizedJson() };
    if (resolution.reason === "INVALID_ID") {
      return { ok: false, response: notFoundJson("That organization doesn't exist.") };
    }
    return { ok: false, response: notFoundJson("That organization doesn't exist.") };
  }

  if (!roleHasPermission(resolution.context.membership.role, permission)) {
    return {
      ok: false,
      response: forbiddenJson(
        `Your role (${resolution.context.membership.role.toLowerCase().replace(/_/g, " ")}) can't perform this action.`,
      ),
    };
  }

  return { ok: true, context: resolution.context };
}
