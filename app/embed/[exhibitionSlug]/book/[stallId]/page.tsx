import { BookingFlow } from "@/components/public/booking-flow";

/**
 * The same booking flow inside the widget, with the embed base path so its "back to the floor plan"
 * link keeps the visitor in the host site's iframe rather than sending them to the full page.
 */
export default async function EmbedBookingPage({
  params,
}: {
  params: Promise<{ exhibitionSlug: string; stallId: string }>;
}) {
  const { exhibitionSlug, stallId } = await params;
  return <BookingFlow slug={exhibitionSlug} stallId={stallId} bookingBasePath="/embed" />;
}
