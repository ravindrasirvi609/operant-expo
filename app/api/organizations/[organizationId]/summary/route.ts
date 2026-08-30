import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const auth = await requireApiPermission(organizationId, "exhibition:view");
  if (!auth.ok) return auth.response;
  const database = await getDatabase();
  const orgId = new ObjectId(organizationId);

  const [exhibitionCount, stallCounts, bookingAgg, activeHolds] = await Promise.all([
    database.collection("exhibitions").countDocuments({ organizationId: orgId }),
    database.collection("stalls").aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: orgId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    database.collection("bookings").aggregate<{ _id: string; count: number; total: number }>([
      { $match: { organizationId: orgId, status: { $in: ["PAYMENT_PENDING", "CONFIRMED"] } } },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$commercialSnapshot.total" } } },
    ]).toArray(),
    database.collection("reservationHolds").countDocuments({ organizationId: orgId, status: "ACTIVE", expiresAt: { $gt: new Date() } }),
  ]);

  const stallsByStatus = Object.fromEntries(stallCounts.map((row) => [row._id, row.count]));
  const bookingsByStatus = Object.fromEntries(bookingAgg.map((row) => [row._id, { count: row.count, total: row.total }]));
  const totalStalls = stallCounts.reduce((sum, row) => sum + row.count, 0);
  const bookedStalls = stallsByStatus.BOOKED ?? 0;

  return NextResponse.json({
    exhibitionCount,
    totalStalls,
    occupancyRate: totalStalls ? Math.round((bookedStalls / totalStalls) * 100) : 0,
    stallsByStatus,
    activeHolds,
    pendingBookings: bookingsByStatus.PAYMENT_PENDING?.count ?? 0,
    confirmedBookings: bookingsByStatus.CONFIRMED?.count ?? 0,
    grossConfirmed: bookingsByStatus.CONFIRMED?.total ?? 0,
  });
}
