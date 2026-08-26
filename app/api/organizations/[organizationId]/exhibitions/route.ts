import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { exhibitionCreateSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  const exhibitions = await (await getDatabase()).collection<ExhibitionDocument>("exhibitions").find({ organizationId: new ObjectId(organizationId) }).sort({ startDate: -1 }).toArray();
  return NextResponse.json({ exhibitions });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:manage");
  const parsed = exhibitionCreateSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid exhibition details", details: parsed.error.flatten() }, { status: 400 });
  const database = await getDatabase();
  if (parsed.data.venueId && !ObjectId.isValid(parsed.data.venueId)) return NextResponse.json({ error: "Invalid venue" }, { status: 400 });
  if (parsed.data.venueId && !(await database.collection("venues").findOne({ _id: new ObjectId(parsed.data.venueId), organizationId: new ObjectId(organizationId) }))) return NextResponse.json({ error: "Venue does not belong to this organization" }, { status: 400 });
  const now = new Date();
  const { venueId, ...data } = parsed.data;
  const exhibition: ExhibitionDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), ...data, ...(venueId ? { venueId: new ObjectId(venueId) } : {}), lifecycle: "DRAFT", createdAt: now, updatedAt: now };
  try {
    await database.collection<ExhibitionDocument>("exhibitions").insertOne(exhibition);
    return NextResponse.json({ exhibition }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Exhibition slug already exists" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create exhibition" }, { status: 500 });
  }
}
