import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { venueSchema } from "@/lib/validation/exhibition";
import type { VenueDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  const database = await getDatabase();
  const venues = await database.collection<VenueDocument>("venues").find({ organizationId: new ObjectId(organizationId) }).sort({ name: 1 }).toArray();
  return NextResponse.json({ venues });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "organization:manage");
  const parsed = venueSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid venue details" }, { status: 400 });
  const now = new Date();
  const venue: VenueDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), ...parsed.data, createdAt: now, updatedAt: now };
  try {
    await (await getDatabase()).collection<VenueDocument>("venues").insertOne(venue);
    return NextResponse.json({ venue }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Venue already exists" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create venue" }, { status: 500 });
  }
}

