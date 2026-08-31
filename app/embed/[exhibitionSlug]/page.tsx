import { notFound } from "next/navigation";

import { ExhibitionView, type SerializedView } from "@/components/public/exhibition-view";
import { loadPublicExhibition } from "@/lib/booking/public-exhibition";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";

/**
 * The embeddable widget.
 *
 * Renders the same component as the public page with `bookingBasePath="/embed"`, so a visitor is
 * never navigated out of the host site's iframe and onto the full-chrome page. Sharing the component
 * is what keeps the two from diverging.
 */
export default async function EmbedExhibitionPage({
  params,
}: {
  params: Promise<{ exhibitionSlug: string }>;
}) {
  const { exhibitionSlug } = await params;
  const visitorId = await readVisitorId();

  const view = await loadPublicExhibition(await getDatabase(), { slug: exhibitionSlug, visitorId });
  if (!view) notFound();

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

  return (
    <>
      <ExhibitionView view={serialized} bookingBasePath="/embed" compact />
      <p className="pb-6 text-center font-mono text-[10px] text-[var(--ink-faint)]">Powered by Operant Expo</p>
    </>
  );
}
