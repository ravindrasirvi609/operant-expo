import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { writeAudit } from "@/lib/audit";
import { stallSchema } from "@/lib/validation/map";
import type { StallDocument } from "@/models/stall";
import { badRequest } from "@/lib/http/responses";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string; stallId: string }> }) {
  const { organizationId, exhibitionId, hallId, stallId } = await params;
  const auth = await requireApiPermission(organizationId, "exhibition:manage");
  if (!auth.ok) return auth.response;
  if (![exhibitionId, hallId, stallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid stall" }, { status: 400 });
  const parsed = stallSchema.partial().safeParse(await readBody(request)); if (!parsed.success) return badRequest(parsed.error, "Check the stall details.");
  const database = await getDatabase(); const { floorPlanElementId, ...fields } = parsed.data; const data = { ...fields, ...(floorPlanElementId ? { floorPlanElementId: new ObjectId(floorPlanElementId) } : {}), ...(parsed.data.currency ? { currency: parsed.data.currency.toUpperCase() } : {}), ...(parsed.data.width && parsed.data.height ? { area: parsed.data.width * parsed.data.height } : {}), updatedAt: new Date() };
  const before = await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(stallId), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) });
  const result = await database.collection<StallDocument>("stalls").findOneAndUpdate({ _id: new ObjectId(stallId), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) }, { $set: data }, { returnDocument: "after" });
  if (!result) return NextResponse.json({ error: "Stall not found" }, { status: 404 });
  await writeAudit(database, { organizationId: new ObjectId(organizationId), action: "stall.updated", entityType: "Stall", entityId: stallId, before: before ? { status: before.status, basePrice: before.basePrice } : undefined, after: { status: result.status, basePrice: result.basePrice } });
  return NextResponse.json({ stall: result });
}
