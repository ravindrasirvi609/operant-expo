import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { mapElementSchema } from "@/lib/validation/map";
import type { FloorPlanDocument, MapElementDocument } from "@/models/map";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string; elementId: string }> }) {
  const { organizationId, floorPlanId, elementId } = await params;
  await requireOrganizationPermission(organizationId, "map:edit");
  if (![floorPlanId, elementId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid map resource" }, { status: 400 });
  const database = await getDatabase();
  const plan = await database.collection<FloorPlanDocument>("floorPlans").findOne({ _id: new ObjectId(floorPlanId), organizationId: new ObjectId(organizationId) });
  if (!plan) return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });
  const parsed = mapElementSchema.partial().safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid map element" }, { status: 400 });
  if (parsed.data.geometry && (parsed.data.geometry.x + parsed.data.geometry.width > plan.canvasWidth || parsed.data.geometry.y + parsed.data.geometry.height > plan.canvasHeight)) return NextResponse.json({ error: "Element must fit inside the floor plan canvas" }, { status: 400 });
  const result = await database.collection<MapElementDocument>("mapElements").findOneAndUpdate({ _id: new ObjectId(elementId), floorPlanId: plan._id, organizationId: new ObjectId(organizationId) }, { $set: { ...parsed.data, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) return NextResponse.json({ error: "Map element not found" }, { status: 404 });
  return NextResponse.json({ element: result });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string; elementId: string }> }) {
  const { organizationId, floorPlanId, elementId } = await params;
  await requireOrganizationPermission(organizationId, "map:edit");
  if (![floorPlanId, elementId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid map resource" }, { status: 400 });
  const result = await (await getDatabase()).collection<MapElementDocument>("mapElements").deleteOne({ _id: new ObjectId(elementId), floorPlanId: new ObjectId(floorPlanId), organizationId: new ObjectId(organizationId) });
  if (!result.deletedCount) return NextResponse.json({ error: "Map element not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}

