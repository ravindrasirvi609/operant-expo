import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";
import type { ExhibitionDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "booking:view");
  const database = await getDatabase();
  const holds = await database.collection<ReservationHoldDocument>("reservationHolds")
    .find({ organizationId: new ObjectId(organizationId), status: "ACTIVE" })
    .sort({ expiresAt: 1 })
    .limit(200)
    .toArray();
  const enriched = await Promise.all(holds.map(async (hold) => {
    const [stall, exhibition] = await Promise.all([
      database.collection<StallDocument>("stalls").findOne({ _id: hold.stallId }),
      database.collection<ExhibitionDocument>("exhibitions").findOne({ _id: hold.exhibitionId }),
    ]);
    return {
      ...hold,
      stall: stall ? { stallNumber: stall.stallNumber, basePrice: stall.basePrice, currency: stall.currency } : null,
      exhibition: exhibition ? { name: exhibition.name, slug: exhibition.slug } : null,
    };
  }));
  return NextResponse.json({ holds: enriched });
}
