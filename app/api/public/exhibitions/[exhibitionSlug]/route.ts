import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { StallDocument } from "@/models/stall";

export async function GET(_: Request, { params }: { params: Promise<{ exhibitionSlug: string }> }) {
  const { exhibitionSlug } = await params;
  const database = await getDatabase();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: { $in: ["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"] } });
  if (!exhibition?._id) return NextResponse.json({ error: "Exhibition not found" }, { status: 404 });
  const halls = await database.collection<HallDocument>("halls").find({ exhibitionId: exhibition._id, status: "ACTIVE", publicVisibility: true }).toArray();
  const result = await Promise.all(halls.map(async (hall) => {
    const plan = await database.collection<FloorPlanDocument>("floorPlans").findOne({ hallId: hall._id, status: "PUBLISHED" }, { sort: { version: -1 } });
    if (!plan) return { hall, floorPlan: null, elements: [], stalls: [] };
    const [elements, stalls, asset] = await Promise.all([database.collection<MapElementDocument>("mapElements").find({ floorPlanId: plan._id, visible: true }).toArray(), database.collection<StallDocument>("stalls").find({ hallId: hall._id, visibility: "PUBLIC" }).toArray(), plan.backgroundAssetId ? database.collection<AssetDocument>("assets").findOne({ _id: plan.backgroundAssetId }) : null]);
    return { hall, floorPlan: { ...plan, backgroundUrl: asset?.url }, elements, stalls };
  }));
  return NextResponse.json({ exhibition: { name: exhibition.name, slug: exhibition.slug, description: exhibition.description, startDate: exhibition.startDate, endDate: exhibition.endDate, timezone: exhibition.timezone }, halls: result });
}

