import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?._id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const database = await getDatabase();
  const memberships = await database.collection<MembershipDocument>("memberships").find({ userId: user._id, status: "ACTIVE" }).toArray();
  const organizations = await database.collection<OrganizationDocument>("organizations").find({ _id: { $in: memberships.map((membership) => membership.organizationId) }, status: "ACTIVE" }).sort({ name: 1 }).toArray();
  return NextResponse.json({ organizations, memberships });
}

