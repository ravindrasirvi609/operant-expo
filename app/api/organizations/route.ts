import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { writeAudit } from "@/lib/audit";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?._id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json()) as { name?: string; slug?: string };
  if (!body.name?.trim() || !body.slug?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) {
    return NextResponse.json({ error: "Valid name and slug are required" }, { status: 400 });
  }
  const database = await getDatabase();
  const now = new Date();
  const organizationId = new ObjectId();
  const organization: OrganizationDocument = { _id: organizationId, name: body.name.trim(), slug: body.slug, status: "ACTIVE", createdAt: now, updatedAt: now };
  const membership: MembershipDocument = { _id: new ObjectId(), organizationId, userId: user._id, role: "OWNER", scopes: ["*"], status: "ACTIVE", createdAt: now, updatedAt: now };
  try {
    await withTransaction(database, async (session) => {
      await database.collection<OrganizationDocument>("organizations").insertOne(organization, { session });
      await database.collection<MembershipDocument>("memberships").insertOne(membership, { session });
      await writeAudit(database, { organizationId, actorId: user._id, action: "organization.created", entityType: "Organization", entityId: organizationId.toString(), after: { name: organization.name, slug: organization.slug } }, session);
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Organization slug already exists" }, { status: 409 });
  }
}
