/**
 * Reading a hall's stall inventory.
 *
 * Creation used to live here too, taking a floorPlanElementId plus its own width and height. That
 * let a stall claim a footprint its rectangle did not have, and it could only attach to an element
 * that already existed — which, now that placing a stall creates both together, always already has
 * one. Stalls are created and edited through .../floor-plans/[floorPlanId]/stalls, which keeps the
 * rectangle and the inventory record in step.
 */
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { StallDocument } from "@/models/stall";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  const auth = await requireApiPermission(organizationId, "exhibition:view");
  if (!auth.ok) return auth.response;
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const stalls = await (await getDatabase()).collection<StallDocument>("stalls").find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) }).sort({ stallNumber: 1 }).toArray();
  return NextResponse.json({ stalls });
}
