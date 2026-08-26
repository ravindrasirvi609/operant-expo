import { NextResponse } from "next/server";

import { requireOrganizationContext } from "@/lib/auth/authorization";

export async function GET(request: Request) {
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const context = await requireOrganizationContext(organizationId);
  return NextResponse.json({ organization: context.organization, membership: context.membership });
}

