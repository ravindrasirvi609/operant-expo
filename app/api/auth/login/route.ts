import { credentialsSchema } from "@/lib/auth/input";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, ok, serverError, unauthorizedJson } from "@/lib/http/responses";
import type { UserDocument } from "@/models/auth";

export async function POST(request: Request) {
  try {
    const parsed = credentialsSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check your email and password.");

    const database = await getDatabase();
    const user = await database
      .collection<UserDocument>("users")
      .findOne({ email: parsed.data.email.toLowerCase(), status: "ACTIVE" });

    // Deliberately one message for "no such user" and "wrong password" — distinguishing them
    // turns this endpoint into an account-enumeration oracle.
    if (!user?._id || !user.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return unauthorizedJson("That email and password don't match an account.");
    }

    const session = await createSession(user._id);
    await setSessionCookie(session.token, session.expiresAt);

    // A non-JSON submission is a no-JavaScript form post, which needs a redirect rather than a
    // JSON body to land the user on their dashboard.
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return Response.redirect(new URL("/dashboard", request.url), 303);
    }

    return ok({ user: { id: user._id.toString(), name: user.name, email: user.email } });
  } catch (cause) {
    return serverError(cause, "POST /api/auth/login");
  }
}
