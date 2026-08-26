import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { BookingDocument } from "@/models/booking";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params; await requireOrganizationPermission(organizationId, "booking:view");
  const bookings = await (await getDatabase()).collection<BookingDocument>("bookings").find({ organizationId: new ObjectId(organizationId) }).sort({ createdAt: -1 }).limit(100).toArray();
  return NextResponse.json({ bookings });
}

