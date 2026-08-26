import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { BookingDocument } from "@/models/booking";
import type { ExhibitorDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params; await requireOrganizationPermission(organizationId, "booking:view");
  const database = await getDatabase(); const bookings = await database.collection<BookingDocument>("bookings").find({ organizationId: new ObjectId(organizationId) }).sort({ createdAt: -1 }).limit(100).toArray();
  const enriched = await Promise.all(bookings.map(async (booking) => { const [exhibitor, stall] = await Promise.all([database.collection<ExhibitorDocument>("exhibitors").findOne({ _id: booking.exhibitorId }), database.collection<StallDocument>("stalls").findOne({ _id: booking.stallId })]); return { ...booking, exhibitor: exhibitor ? { companyName: exhibitor.companyName, contactPerson: exhibitor.contactPerson, email: exhibitor.email, phone: exhibitor.phone } : null, stall: stall ? { stallNumber: stall.stallNumber, section: stall.section, stallType: stall.stallType, basePrice: stall.basePrice } : null }; }));
  return NextResponse.json({ bookings: enriched });
}
