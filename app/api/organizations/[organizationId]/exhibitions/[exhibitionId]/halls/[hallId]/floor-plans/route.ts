import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { floorPlanSchema } from "@/lib/validation/map";
import type { FloorPlanDocument } from "@/models/map";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const plans = await (await getDatabase()).collection<FloorPlanDocument>("floorPlans").find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) }).sort({ version: -1 }).toArray();
  return NextResponse.json({ floorPlans: plans });
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  const context = await requireOrganizationPermission(organizationId, "map:edit");
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const database = await getDatabase();
  const hall = await database.collection("halls").findOne({ _id: new ObjectId(hallId), exhibitionId: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
  if (!hall) return NextResponse.json({ error: "Hall not found" }, { status: 404 });
  const parsed = floorPlanSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid floor plan details" }, { status: 400 });
  if (parsed.data.backgroundAssetId && !ObjectId.isValid(parsed.data.backgroundAssetId)) return NextResponse.json({ error: "Invalid background asset" }, { status: 400 });
  const latest = await database.collection<FloorPlanDocument>("floorPlans").findOne({ hallId: new ObjectId(hallId) }, { sort: { version: -1 } });
  const plan: FloorPlanDocument = { _id: new ObjectId(), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId), version: (latest?.version ?? 0) + 1, canvasWidth: parsed.data.canvasWidth, canvasHeight: parsed.data.canvasHeight, ...(parsed.data.backgroundAssetId ? { backgroundAssetId: new ObjectId(parsed.data.backgroundAssetId) } : {}), status: "DRAFT", createdBy: context.user._id!, createdAt: new Date(), updatedAt: new Date() };
  await database.collection<FloorPlanDocument>("floorPlans").insertOne(plan);
  return NextResponse.json({ floorPlan: plan }, { status: 201 });
}

