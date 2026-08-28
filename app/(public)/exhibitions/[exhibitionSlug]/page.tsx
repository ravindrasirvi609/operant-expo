import { notFound } from "next/navigation";

import { MapViewer } from "@/components/exhibition-map/viewer";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { getDatabase } from "@/lib/db/client";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { StallDocument } from "@/models/stall";

export default async function PublicExhibitionPage({ params }: { params: Promise<{ exhibitionSlug: string }> }) {
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
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="max-w-3xl">
        <SectionEyebrow>Exhibition booking</SectionEyebrow>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[var(--ink)]">{exhibition.name}</h1>
        <p className="mt-4 text-[var(--ink-soft)]">{exhibition.description}</p>
        <p className="mt-3 font-mono text-sm text-[var(--ink-faint)]">{new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}</p>
      </div>
      <DimensionDivider className="mt-8" />
      <div className="mt-10 space-y-10">
        {maps.map(({ hall, plan, elements, asset, stalls }) => (
          <section key={hall._id!.toString()} className="corner-marks rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">{hall.name}</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{stalls.length} public stalls · Click an available stall to reserve it</p>
              </div>
              <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)]">{plan ? "Map available" : "Map coming soon"}</span>
            </div>
            {plan ? (
              <div className="mt-6">
                <MapViewer width={plan.canvasWidth} height={plan.canvasHeight} backgroundUrl={asset?.url} elements={elements.map((element) => {
                  const stall = stalls.find((item) => item.floorPlanElementId?.toString() === element._id?.toString());
                  return { ...element, _id: element._id!.toString(), stallId: stall?._id?.toString(), status: stall?.status ?? element.status };
                })} />
              </div>
            ) : (
              <p className="mt-6 text-[var(--ink-soft)]">This hall has not published a booking map yet.</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
