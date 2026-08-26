import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";

export async function getOrganizationContext(organizationId: string) {
  if (!ObjectId.isValid(organizationId)) return null;

  const user = await getCurrentUser();
  if (!user?._id) return null;

  const database = await getDatabase();
  const membership = await database.collection<MembershipDocument>("memberships").findOne({
    organizationId: new ObjectId(organizationId),
    userId: user._id,
    status: "ACTIVE",
  });
  if (!membership) return null;

  const organization = await database.collection<OrganizationDocument>("organizations").findOne({
    _id: membership.organizationId,
    status: "ACTIVE",
  });
  if (!organization) return null;

  return { user, organization, membership };
}

