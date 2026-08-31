import { ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { sweepExpiredHolds } from "@/lib/booking/holds";
import { getDatabase } from "@/lib/db/client";
import { notFoundJson, ok, serverError } from "@/lib/http/responses";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";
import type { FloorPlanDocument } from "@/models/map";

type RouteParams = { params: Promise<{ organizationId: string; exhibitionId: string }> };

/**
 * One read for the exhibition detail screen: its halls, each hall's plan status and stall
 * breakdown, and the commercial totals.
 *
 * Aggregated server-side rather than assembled from a request per hall, so a ten-hall event costs
 * one round trip. Holds are swept first so the availability figures shown to an organizer match what
 * a visitor would see.
 */
export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;
    if (!ObjectId.isValid(exhibitionId)) return notFoundJson("That exhibition could not be found.");

    const database = await getDatabase();
    const organizationObjectId = new ObjectId(organizationId);
    const exhibitionObjectId = new ObjectId(exhibitionId);

    const exhibition = await database
      .collection<ExhibitionDocument>("exhibitions")
      .findOne({ _id: exhibitionObjectId, organizationId: organizationObjectId });
    if (!exhibition) return notFoundJson("That exhibition could not be found.");

    await sweepExpiredHolds(database, { exhibitionId: exhibitionObjectId });

    const [halls, plans, stallRows, bookingRows, activeHolds] = await Promise.all([
      database
        .collection<HallDocument>("halls")
        .find({ exhibitionId: exhibitionObjectId, organizationId: organizationObjectId })
        .sort({ name: 1 })
        .toArray(),
      database
        .collection<FloorPlanDocument>("floorPlans")
        .find({ exhibitionId: exhibitionObjectId, organizationId: organizationObjectId })
        .toArray(),
      database
        .collection("stalls")
        .aggregate<{ _id: { hallId: ObjectId; status: string }; count: number; unpriced: number }>([
          { $match: { exhibitionId: exhibitionObjectId } },
          {
            $group: {
              _id: { hallId: "$hallId", status: "$status" },
              count: { $sum: 1 },
              unpriced: { $sum: { $cond: [{ $lte: ["$basePrice", 0] }, 1, 0] } },
            },
          },
        ])
        .toArray(),
      database
        .collection("bookings")
        .aggregate<{ _id: string; count: number; total: number }>([
          { $match: { exhibitionId: exhibitionObjectId } },
          { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$commercialSnapshot.total" } } },
        ])
        .toArray(),
      database
        .collection("reservationHolds")
        .countDocuments({ exhibitionId: exhibitionObjectId, status: "ACTIVE", expiresAt: { $gt: new Date() } }),
    ]);

    const planByHall = new Map(plans.map((plan) => [plan.hallId.toString(), plan]));

    const hallSummaries = halls.map((hall) => {
      const hallKey = hall._id!.toString();
      const rows = stallRows.filter((row) => row._id.hallId.toString() === hallKey);
      const byStatus: Record<string, number> = {};
      let stalls = 0;
      let unpriced = 0;
      for (const row of rows) {
        byStatus[row._id.status] = (byStatus[row._id.status] ?? 0) + row.count;
        stalls += row.count;
        unpriced += row.unpriced;
      }
      const plan = planByHall.get(hallKey);
      return {
        id: hallKey,
        name: hall.name,
        code: hall.code,
        width: hall.width,
        height: hall.height,
        publicVisibility: hall.publicVisibility,
        planStatus: plan?.status ?? null,
        planRevision: plan?.revision ?? null,
        stalls,
        unpriced,
        stallsByStatus: byStatus,
      };
    });

    const bookingsByStatus = Object.fromEntries(
      bookingRows.map((row) => [row._id, { count: row.count, total: row.total }]),
    );
    const totalStalls = hallSummaries.reduce((sum, hall) => sum + hall.stalls, 0);
    const bookedStalls = hallSummaries.reduce((sum, hall) => sum + (hall.stallsByStatus.BOOKED ?? 0), 0);

    return ok({
      exhibition: {
        _id: exhibition._id!.toString(),
        name: exhibition.name,
        slug: exhibition.slug,
        shortDescription: exhibition.shortDescription,
        lifecycle: exhibition.lifecycle,
        startDate: exhibition.startDate,
        endDate: exhibition.endDate,
        timezone: exhibition.timezone,
      },
      halls: hallSummaries,
      totals: {
        halls: halls.length,
        publishedPlans: hallSummaries.filter((hall) => hall.planStatus === "PUBLISHED").length,
        totalStalls,
        unpricedStalls: hallSummaries.reduce((sum, hall) => sum + hall.unpriced, 0),
        bookedStalls,
        occupancyRate: totalStalls ? Math.round((bookedStalls / totalStalls) * 100) : 0,
        activeHolds,
        pendingBookings: bookingsByStatus.PAYMENT_PENDING?.count ?? 0,
        confirmedBookings: bookingsByStatus.CONFIRMED?.count ?? 0,
        grossConfirmed: bookingsByStatus.CONFIRMED?.total ?? 0,
        grossPending: bookingsByStatus.PAYMENT_PENDING?.total ?? 0,
      },
    });
  } catch (cause) {
    return serverError(cause, "GET .../exhibitions/[exhibitionId]/summary");
  }
}
