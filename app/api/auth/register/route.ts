import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { hashPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { registrationSchema } from "@/lib/auth/input";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { writeAudit } from "@/lib/audit";
import { readBody } from "@/lib/http/body";
import type { MembershipDocument, OrganizationDocument, UserDocument } from "@/models/auth";

export async function POST(request: Request) {
  const parsed = registrationSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration details" }, { status: 400 });

  const { email, password, name, organizationName, organizationSlug } = parsed.data;
  const database = await getDatabase();
  const existing = await database.collection<UserDocument>("users").findOne({ email: email.toLowerCase() });
  if (existing) return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });

  const now = new Date();
  const userId = new ObjectId();
  const organizationId = new ObjectId();
  const passwordHash = await hashPassword(password);
  const user: UserDocument = { _id: userId, email: email.toLowerCase(), name, status: "ACTIVE", passwordHash, createdAt: now, updatedAt: now };
  const organization: OrganizationDocument = { _id: organizationId, name: organizationName, slug: organizationSlug, status: "ACTIVE", createdAt: now, updatedAt: now };
  const membership: MembershipDocument = { organizationId, userId, role: "OWNER", scopes: ["*"], status: "ACTIVE", createdAt: now, updatedAt: now };

  try {
    await withTransaction(database, async (session) => {
      await database.collection<UserDocument>("users").insertOne(user, { session });
      await database.collection<OrganizationDocument>("organizations").insertOne(organization, { session });
      await database.collection<MembershipDocument>("memberships").insertOne(membership, { session });
      await writeAudit(database, { organizationId, actorId: userId, action: "organization.created", entityType: "Organization", entityId: organizationId.toString(), after: { name: organizationName, slug: organizationSlug } }, session);
    });
    const session = await createSession(userId);
    await setSessionCookie(session.token, session.expiresAt);
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.redirect(new URL("/dashboard", request.url), 303);
    }
    return NextResponse.json({ user: { id: userId.toString(), name, email: user.email }, organization: { id: organizationId.toString(), name, slug: organizationSlug } }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "That organization slug is already in use" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
  }
}
