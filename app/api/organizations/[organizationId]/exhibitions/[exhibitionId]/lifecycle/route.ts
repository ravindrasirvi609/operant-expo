import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { ExhibitionDocument } from "@/models/exhibition";

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> }) {
  const { organizationId, exhibitionId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:manage");
  if (![organizationId, exhibitionId].every(ObjectId.isValid)) return NextResponse.json({ error: "Invalid exhibition" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { lifecycle?: ExhibitionDocument["lifecycle"] };
  if (!body.lifecycle || !["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED", "COMPLETED", "ARCHIVED"].includes(body.lifecycle)) return NextResponse.json({ error: "Invalid lifecycle transition" }, { status: 400 });
  const database = await getDatabase();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
  if (!exhibition) return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  if (body.lifecycle === "PUBLISHED" && !(await database.collection("halls").findOne({ exhibitionId: exhibition._id, organizationId: exhibition.organizationId, status: "ACTIVE" }))) return NextResponse.json({ error: "Add at least one active hall before publishing" }, { status: 400 });
  const result = await database.collection<ExhibitionDocument>("exhibitions").findOneAndUpdate({ _id: exhibition._id }, { $set: { lifecycle: body.lifecycle, updatedAt: new Date() } }, { returnDocument: "after" });
  return NextResponse.json({ exhibition: result });
}

