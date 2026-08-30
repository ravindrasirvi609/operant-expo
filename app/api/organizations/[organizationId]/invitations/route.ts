import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { invitationSchema } from "@/lib/auth/input";
import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { createSessionToken, hashSessionToken } from "@/lib/auth/token";
import { writeAudit } from "@/lib/audit";
import type { InvitationDocument } from "@/models/auth";
import { readBody } from "@/lib/http/body";
import { badRequest } from "@/lib/http/responses";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const auth = await requireApiPermission(organizationId, "organization:manage");
  if (!auth.ok) return auth.response;
  const context = auth.context;
  const parsed = invitationSchema.safeParse(await readBody(request));
  if (!parsed.success) return badRequest(parsed.error, "Check the invitation details.");
  const now = new Date();
  const token = createSessionToken();
  const invitation: InvitationDocument = { organizationId: new ObjectId(organizationId), email: parsed.data.email.toLowerCase(), role: parsed.data.role, tokenHash: hashSessionToken(token), expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), invitedBy: context.user._id!, createdAt: now };
  const database = await getDatabase();
  await database.collection<InvitationDocument>("invitations").insertOne(invitation);
  await writeAudit(database, { organizationId: new ObjectId(organizationId), actorId: context.user._id, action: "invitation.created", entityType: "Invitation", entityId: invitation._id!.toString(), after: { email: invitation.email, role: invitation.role } });
  return NextResponse.json({ invitationId: invitation._id?.toString(), token, expiresAt: invitation.expiresAt }, { status: 201 });
}
