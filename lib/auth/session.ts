import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/db/client";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/constants";
import { createSessionToken, hashSessionToken } from "@/lib/auth/token";
import type { SessionDocument, UserDocument } from "@/models/auth";

export async function createSession(userId: ObjectId) {
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const session: SessionDocument = {
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
  };

  const database = await getDatabase();
  await database.collection<SessionDocument>("sessions").insertOne(session);
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const database = await getDatabase();
    await database.collection<SessionDocument>("sessions").deleteOne({
      tokenHash: hashSessionToken(token),
    });
  }
  await clearSessionCookie();
}

export async function getCurrentUser(): Promise<UserDocument | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const database = await getDatabase();
  const session = await database.collection<SessionDocument>("sessions").findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;

  return database.collection<UserDocument>("users").findOne({
    _id: session.userId,
    status: "ACTIVE",
  });
}
