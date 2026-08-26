import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?._id) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: { id: user._id.toString(), name: user.name, email: user.email } });
}

