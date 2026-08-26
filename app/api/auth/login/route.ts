import { NextResponse } from "next/server";

import { credentialsSchema } from "@/lib/auth/input";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import type { UserDocument } from "@/models/auth";
import { readBody } from "@/lib/http/body";

export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  const database = await getDatabase();
  const user = await database.collection<UserDocument>("users").findOne({ email: parsed.data.email.toLowerCase(), status: "ACTIVE" });
  if (!user?._id || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const session = await createSession(user._id);
  await setSessionCookie(session.token, session.expiresAt);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.redirect(new URL("/dashboard", request.url), 303);
  }
  return NextResponse.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
}
