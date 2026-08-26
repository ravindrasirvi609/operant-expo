import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hashSessionToken } from "@/lib/auth/token";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import type { InvitationDocument, MembershipDocument } from "@/models/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?._id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await readBody(request) as { token?: string };
  if (!body.token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
  const database = await getDatabase();
  const invitation = await database.collection<InvitationDocument>("invitations").findOne({ tokenHash: hashSessionToken(body.token), expiresAt: { $gt: new Date() }, acceptedAt: { $exists: false }, email: user.email });
  if (!invitation?._id) return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  const now = new Date();
  const membership: MembershipDocument = { organizationId: invitation.organizationId, userId: user._id, role: invitation.role, scopes: [], status: "ACTIVE", createdAt: now, updatedAt: now };
  await database.collection<MembershipDocument>("memberships").updateOne({ organizationId: invitation.organizationId, userId: user._id }, { $set: membership }, { upsert: true });
  await database.collection<InvitationDocument>("invitations").updateOne({ _id: invitation._id }, { $set: { acceptedAt: now } });
  return NextResponse.json({ success: true, organizationId: invitation.organizationId.toString(), role: invitation.role });
}
