import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { venueSchema } from "@/lib/validation/exhibition";
import type { VenueDocument } from "@/models/exhibition";
import { badRequest } from "@/lib/http/responses";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const auth = await requireApiPermission(organizationId, "exhibition:view");
  if (!auth.ok) return auth.response;
  const database = await getDatabase();
  const venues = await database.collection<VenueDocument>("venues").find({ organizationId: new ObjectId(organizationId) }).sort({ name: 1 }).toArray();
  return NextResponse.json({ venues });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const auth = await requireApiPermission(organizationId, "organization:manage");
  if (!auth.ok) return auth.response;
  const parsed = venueSchema.safeParse(await readBody(request));
  if (!parsed.success) return badRequest(parsed.error, "Check the venue details.");
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

