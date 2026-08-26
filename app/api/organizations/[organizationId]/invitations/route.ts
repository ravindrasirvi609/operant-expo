import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { invitationSchema } from "@/lib/auth/input";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { createSessionToken, hashSessionToken } from "@/lib/auth/token";
import type { InvitationDocument } from "@/models/auth";
import { readBody } from "@/lib/http/body";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const context = await requireOrganizationPermission(organizationId, "organization:manage");
  const parsed = invitationSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation details" }, { status: 400 });
  const now = new Date();
  const token = createSessionToken();
  const invitation: InvitationDocument = { organizationId: new ObjectId(organizationId), email: parsed.data.email.toLowerCase(), role: parsed.data.role, tokenHash: hashSessionToken(token), expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), invitedBy: context.user._id!, createdAt: now };
  const database = await getDatabase();
  await database.collection<InvitationDocument>("invitations").insertOne(invitation);
  return NextResponse.json({ invitationId: invitation._id?.toString(), token, expiresAt: invitation.expiresAt }, { status: 201 });
}
