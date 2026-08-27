import { notFound } from "next/navigation";

import { MapViewer } from "@/components/exhibition-map/viewer";
import { PublishMapButton } from "@/components/exhibition-map/publish-button";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import { ObjectId } from "mongodb";

export default async function MapPage({ params, searchParams }: { params: Promise<{ exhibitionId: string; hallId: string }>; searchParams: Promise<{ organizationId?: string }> }) {
  const { exhibitionId, hallId } = await params;
  const { organizationId } = await searchParams;
  if (!organizationId || !ObjectId.isValid(exhibitionId) || !ObjectId.isValid(hallId)) notFound();
  await requireOrganizationPermission(organizationId, "exhibition:view");
  const database = await getDatabase();
  const hall = await database.collection<HallDocument>("halls").findOne({ _id: new ObjectId(hallId), exhibitionId: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
  if (!hall) notFound();
  const plan = await database.collection<FloorPlanDocument>("floorPlans").findOne({ hallId: hall._id, status: { $in: ["PUBLISHED", "DRAFT"] } }, { sort: { version: -1 } });
  if (!plan) return <main className="mx-auto max-w-5xl px-6 py-12"><h1 className="text-2xl font-semibold">{hall.name} map</h1><p className="mt-3 text-zinc-500">No floor plan has been created for this hall yet.</p><a className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white" href={`/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/map/setup?organizationId=${organizationId}`}>Create floor plan</a></main>;
  const elements = await database.collection<MapElementDocument>("mapElements").find({ floorPlanId: plan._id }).toArray();
  const asset = plan.backgroundAssetId ? await database.collection<AssetDocument>("assets").findOne({ _id: plan.backgroundAssetId }) : null;
  return <main className="mx-auto max-w-6xl px-6 py-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-600">Map viewer</p><h1 className="mt-2 text-3xl font-semibold">{hall.name}</h1><p className="mt-2 text-sm text-zinc-500">Version {plan.version} · {plan.status.toLowerCase()}</p></div>{plan.status === "DRAFT" && <PublishMapButton organizationId={organizationId} floorPlanId={plan._id!.toString()} />}</div><div className="mt-6"><MapViewer width={plan.canvasWidth} height={plan.canvasHeight} backgroundUrl={asset?.url} elements={elements.map((element) => ({ ...element, _id: element._id!.toString() }))} /></div></main>;
}
