import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { FloorPlanDocument } from "@/models/map";

export async function POST(_: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string }> }) {
  const { organizationId, floorPlanId } = await params; await requireOrganizationPermission(organizationId, "map:edit");
  if (!ObjectId.isValid(floorPlanId)) return NextResponse.json({ error: "Invalid floor plan" }, { status: 400 });
  const database = await getDatabase(); const current = await database.collection<FloorPlanDocument>("floorPlans").findOne({ _id: new ObjectId(floorPlanId), organizationId: new ObjectId(organizationId) });
  if (!current) return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });
  await database.collection<FloorPlanDocument>("floorPlans").updateMany({ hallId: current.hallId, status: "PUBLISHED", _id: { $ne: current._id } }, { $set: { status: "ARCHIVED", updatedAt: new Date() } });
  const result = await database.collection<FloorPlanDocument>("floorPlans").findOneAndUpdate({ _id: current._id }, { $set: { status: "PUBLISHED", updatedAt: new Date() } }, { returnDocument: "after" });
  return NextResponse.json({ floorPlan: result });
}

