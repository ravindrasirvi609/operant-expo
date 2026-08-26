import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { exhibitionUpdateSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument } from "@/models/exhibition";

async function findExhibition(organizationId: string, exhibitionId: string) {
  if (!ObjectId.isValid(exhibitionId)) return null;
  return (await getDatabase()).collection<ExhibitionDocument>("exhibitions").findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
}

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> }) {
  const { organizationId, exhibitionId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  const exhibition = await findExhibition(organizationId, exhibitionId);
  if (!exhibition) return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  return NextResponse.json({ exhibition });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> }) {
  const { organizationId, exhibitionId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:manage");
  const existing = await findExhibition(organizationId, exhibitionId);
  if (!existing) return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  const parsed = exhibitionUpdateSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exhibition details" }, { status: 400 });
  if (parsed.data.venueId && !ObjectId.isValid(parsed.data.venueId)) return NextResponse.json({ error: "Invalid venue" }, { status: 400 });
  const { venueId, ...data } = parsed.data;
  const updates = { ...data, ...(venueId ? { venueId: new ObjectId(venueId) } : {}), updatedAt: new Date() };
  await (await getDatabase()).collection<ExhibitionDocument>("exhibitions").updateOne({ _id: existing._id }, { $set: updates });
  return NextResponse.json({ exhibition: await findExhibition(organizationId, exhibitionId) });
}
