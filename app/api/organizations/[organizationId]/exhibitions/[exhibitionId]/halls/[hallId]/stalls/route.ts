import { NextResponse } from "next/server";
import { MongoServerError, ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { writeAudit } from "@/lib/audit";
import { stallSchema } from "@/lib/validation/map";
import type { StallDocument } from "@/models/stall";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const stalls = await (await getDatabase()).collection<StallDocument>("stalls").find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) }).sort({ stallNumber: 1 }).toArray();
  return NextResponse.json({ stalls });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:manage");
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const parsed = stallSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stall details", details: parsed.error.flatten() }, { status: 400 });
  const database = await getDatabase();
  if (!ObjectId.isValid(parsed.data.floorPlanElementId)) return NextResponse.json({ error: "Invalid map element" }, { status: 400 });
  const element = await database.collection("mapElements").findOne({ _id: new ObjectId(parsed.data.floorPlanElementId), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId), type: "STALL" });
  if (!element) return NextResponse.json({ error: "Map element must be a stall in this hall" }, { status: 400 });
  const now = new Date();
  const stall: StallDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId), floorPlanElementId: new ObjectId(parsed.data.floorPlanElementId), stallNumber: parsed.data.stallNumber, section: parsed.data.section, stallType: parsed.data.stallType, width: parsed.data.width, height: parsed.data.height, area: parsed.data.width * parsed.data.height, basePrice: parsed.data.basePrice, currency: parsed.data.currency, status: "AVAILABLE", description: parsed.data.description, amenities: parsed.data.amenities, visibility: parsed.data.visibility, createdAt: now, updatedAt: now };
  try {
    await database.collection<StallDocument>("stalls").insertOne(stall);
    await writeAudit(database, { organizationId: new ObjectId(organizationId), action: "stall.created", entityType: "Stall", entityId: stall._id!.toString(), after: { stallNumber: stall.stallNumber, basePrice: stall.basePrice, status: stall.status } });
    return NextResponse.json({ stall }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "Stall number already exists in this hall" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create stall" }, { status: 500 });
  }
}

