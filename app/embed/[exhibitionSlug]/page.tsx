import { notFound } from "next/navigation";

import { MapViewer } from "@/components/exhibition-map/viewer";
import { getDatabase } from "@/lib/db/client";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { StallDocument } from "@/models/stall";

export default async function EmbedExhibitionPage({ params }: { params: Promise<{ exhibitionSlug: string }> }) {
  const { exhibitionSlug } = await params;
  const database = await getDatabase();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: { $in: ["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"] } });
  if (!exhibition?._id) notFound();
  const halls = await database.collection<HallDocument>("halls").find({ exhibitionId: exhibition._id, status: "ACTIVE", publicVisibility: true }).toArray();
  const maps = await Promise.all(halls.map(async (hall) => {
    const plan = await database.collection<FloorPlanDocument>("floorPlans").findOne({ hallId: hall._id, status: "PUBLISHED" }, { sort: { version: -1 } });
    if (!plan) return { hall, plan: null, elements: [], asset: null, stalls: [] };
    const [elements, asset, stalls] = await Promise.all([
      database.collection<MapElementDocument>("mapElements").find({ floorPlanId: plan._id, visible: true }).toArray(),
      plan.backgroundAssetId ? database.collection<AssetDocument>("assets").findOne({ _id: plan.backgroundAssetId }) : null,
      database.collection<StallDocument>("stalls").find({ hallId: hall._id, visibility: "PUBLIC" }).sort({ stallNumber: 1 }).toArray(),
    ]);
    return { hall, plan, elements, asset, stalls };
  }));

  return (
    <main className="px-4 py-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--ink)]">{exhibition.name}</h1>
        <p className="mt-1 font-mono text-xs text-[var(--ink-soft)]">{new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}</p>
      </div>
      <div className="mt-6 space-y-8">
        {maps.map(({ hall, plan, elements, asset, stalls }) => (
          <section key={hall._id!.toString()}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{hall.name}</h2>
              <span className="font-mono text-xs text-[var(--ink-soft)]">{stalls.length} public stalls</span>
            </div>
            {plan ? (
              <div className="mt-3">
                <MapViewer
                  bookingBasePath="/embed"
                  width={plan.canvasWidth}
                  height={plan.canvasHeight}
                  backgroundUrl={asset?.url}
                  elements={elements.map((element) => {
                    const stall = stalls.find((item) => item.floorPlanElementId?.toString() === element._id?.toString());
                    return {
                      _id: element._id!.toString(),
                      type: element.type,
                      label: element.label,
                      geometry: element.geometry,
                      visible: element.visible,
                      stallId: stall?._id?.toString(),
                      status: stall?.status,
                    };
                  })}
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--ink-soft)]">This hall has not published a booking map yet.</p>
            )}
          </section>
        ))}
      </div>
      <p className="mt-8 text-center font-mono text-[10px] text-[var(--ink-faint)]">Powered by Operant Expo</p>
    </main>
  );
}
