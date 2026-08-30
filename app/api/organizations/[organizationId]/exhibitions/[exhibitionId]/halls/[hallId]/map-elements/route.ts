import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { MapElementDocument } from "@/models/map";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> }) {
  const { organizationId, exhibitionId, hallId } = await params;
  const auth = await requireApiPermission(organizationId, "exhibition:view");
  if (!auth.ok) return auth.response;
  if (![organizationId, exhibitionId, hallId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const elements = await (await getDatabase()).collection<MapElementDocument>("mapElements").find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId), type: "STALL" }).sort({ label: 1 }).toArray();
  return NextResponse.json({ elements });
}

