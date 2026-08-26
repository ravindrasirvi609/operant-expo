import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { mapElementSchema } from "@/lib/validation/map";
import type { FloorPlanDocument, MapElementDocument } from "@/models/map";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string }> }) {
  const { organizationId, floorPlanId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  if (!ObjectId.isValid(floorPlanId)) return NextResponse.json({ error: "Invalid floor plan" }, { status: 400 });
  const elements = await (await getDatabase()).collection<MapElementDocument>("mapElements").find({ organizationId: new ObjectId(organizationId), floorPlanId: new ObjectId(floorPlanId) }).sort({ zIndex: 1 }).toArray();
  return NextResponse.json({ elements });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string }> }) {
  const { organizationId, floorPlanId } = await params;
  await requireOrganizationPermission(organizationId, "map:edit");
  if (!ObjectId.isValid(floorPlanId)) return NextResponse.json({ error: "Invalid floor plan" }, { status: 400 });
  const database = await getDatabase();
  const plan = await database.collection<FloorPlanDocument>("floorPlans").findOne({ _id: new ObjectId(floorPlanId), organizationId: new ObjectId(organizationId) });
  if (!plan) return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });
  const parsed = mapElementSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid map element", details: parsed.error.flatten() }, { status: 400 });
  const { geometry } = parsed.data;
  if (geometry.x + geometry.width > plan.canvasWidth || geometry.y + geometry.height > plan.canvasHeight) return NextResponse.json({ error: "Element must fit inside the floor plan canvas" }, { status: 400 });
  const now = new Date();
  const element: MapElementDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), exhibitionId: plan.exhibitionId, hallId: plan.hallId, floorPlanId: plan._id!, ...parsed.data, createdAt: now, updatedAt: now };
  await database.collection<MapElementDocument>("mapElements").insertOne(element);
  return NextResponse.json({ element }, { status: 201 });
}
