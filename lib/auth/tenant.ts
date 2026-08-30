import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import type { MembershipDocument, OrganizationDocument, UserDocument } from "@/models/auth";

export type OrganizationContext = {
  user: UserDocument;
  organization: OrganizationDocument;
  membership: MembershipDocument;
};

/** Why a context could not be resolved. Callers map these onto the right HTTP status. */
export type TenantFailureReason =
  | "INVALID_ID"
  | "UNAUTHENTICATED"
  | "NOT_A_MEMBER"
  | "ORGANIZATION_INACTIVE";

export type TenantResolution =
  | { ok: true; context: OrganizationContext }
  | { ok: false; reason: TenantFailureReason };

/**
 * Resolves the caller's membership of an organization, reporting *why* it failed.
 *
 * The distinction matters at the HTTP boundary: an anonymous caller must get 401 so the client
 * can redirect to sign-in, whereas a signed-in caller who isn't a member must get 404 rather
 * than 403 — telling them "you lack permission" would confirm the organization exists and leak
 * the existence of other tenants' data.
 */
export async function resolveOrganizationContext(organizationId: string): Promise<TenantResolution> {
  if (!ObjectId.isValid(organizationId)) return { ok: false, reason: "INVALID_ID" };

  const user = await getCurrentUser();
  if (!user?._id) return { ok: false, reason: "UNAUTHENTICATED" };

  const database = await getDatabase();
  const membership = await database.collection<MembershipDocument>("memberships").findOne({
    organizationId: new ObjectId(organizationId),
    userId: user._id,
    status: "ACTIVE",
  });
  if (!membership) return { ok: false, reason: "NOT_A_MEMBER" };

  const organization = await database.collection<OrganizationDocument>("organizations").findOne({
    _id: membership.organizationId,
    status: "ACTIVE",
  });
  if (!organization) return { ok: false, reason: "ORGANIZATION_INACTIVE" };

  return { ok: true, context: { user, organization, membership } };
}

/** Nullable form retained for call sites that only need "may I, yes or no". */
export async function getOrganizationContext(organizationId: string) {
  const resolution = await resolveOrganizationContext(organizationId);
  return resolution.ok ? resolution.context : null;
}
