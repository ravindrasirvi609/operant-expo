import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { hallSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> }) {
  const { organizationId, exhibitionId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  if (!ObjectId.isValid(exhibitionId)) return NextResponse.json({ error: "Invalid exhibition" }, { status: 400 });
  const database = await getDatabase();
  const halls = await database.collection<HallDocument>("halls").find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId) }).sort({ name: 1 }).toArray();
  return NextResponse.json({ halls });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> }) {
  const { organizationId, exhibitionId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:manage");
  if (!ObjectId.isValid(exhibitionId)) return NextResponse.json({ error: "Invalid exhibition" }, { status: 400 });
  const database = await getDatabase();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
  if (!exhibition) return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  const parsed = hallSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid hall details" }, { status: 400 });
  const now = new Date();
  const hall: HallDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), ...parsed.data, status: "ACTIVE", createdAt: now, updatedAt: now };
  try {
    await database.collection<HallDocument>("halls").insertOne(hall);
    return NextResponse.json({ hall }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Hall code already exists" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create hall" }, { status: 500 });
  }
}

