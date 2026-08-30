import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { ok, serverError, unauthorizedJson } from "@/lib/http/responses";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";
import type { OrganizationRole } from "@/types/domain";

export type MyOrganization = {
  _id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?._id) return unauthorizedJson();

    const database = await getDatabase();
    const memberships = await database
      .collection<MembershipDocument>("memberships")
      .find({ userId: user._id, status: "ACTIVE" })
      .toArray();

    if (memberships.length === 0) return ok({ organizations: [] satisfies MyOrganization[] });

    const documents = await database
      .collection<OrganizationDocument>("organizations")
      .find({ _id: { $in: memberships.map((membership) => membership.organizationId) }, status: "ACTIVE" })
      .sort({ name: 1 })
      .toArray();

    // The caller's role travels with each organization so the UI can hide actions the role
    // cannot perform, instead of rendering them and letting the API reject the click.
    const roleByOrganization = new Map(
      memberships.map((membership) => [membership.organizationId.toString(), membership.role]),
    );

    const organizations: MyOrganization[] = documents.map((organization) => ({
      _id: organization._id!.toString(),
      name: organization.name,
      slug: organization.slug,
      role: roleByOrganization.get(organization._id!.toString())!,
    }));

    return ok({ organizations });
  } catch (cause) {
    return serverError(cause, "GET /api/me/organizations");
  }
}
