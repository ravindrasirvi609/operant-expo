import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ExhibitionView, type SerializedView } from "@/components/public/exhibition-view";
import { loadPublicExhibition } from "@/lib/booking/public-exhibition";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";

type PageProps = { params: Promise<{ exhibitionSlug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { exhibitionSlug } = await params;
  const view = await loadPublicExhibition(await getDatabase(), { slug: exhibitionSlug });
  if (!view) return { title: "Exhibition not found" };
  return {
    title: view.exhibition.name,
    description: view.exhibition.shortDescription ?? view.exhibition.description,
  };
}

/**
 * The public booking page.
 *
 * Both this page and the JSON feed go through `loadPublicExhibition`, so what a visitor sees and
 * what the API would accept cannot drift apart. The old page built its own queries and derived a
 * stall's status by falling back to a field on the map element, which let a rectangle with no
 * inventory render as though it were available.
 */
export default async function PublicExhibitionPage({ params }: PageProps) {
  const { exhibitionSlug } = await params;
  const visitorId = await readVisitorId();

  const view = await loadPublicExhibition(await getDatabase(), { slug: exhibitionSlug, visitorId });
  if (!view) notFound();

  // Dates and ObjectIds cannot cross into a Client Component as-is.
  const serialized: SerializedView = {
    ...view,
    exhibition: {
      ...view.exhibition,
      startDate: view.exhibition.startDate.toISOString(),
      endDate: view.exhibition.endDate.toISOString(),
    },
    yourHold: view.yourHold
      ? { ...view.yourHold, expiresAt: view.yourHold.expiresAt.toISOString() }
      : null,
  };

  return <ExhibitionView view={serialized} />;
}
