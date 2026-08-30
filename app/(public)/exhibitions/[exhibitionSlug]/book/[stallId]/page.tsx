import { BookingFlow } from "@/components/public/booking-flow";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ exhibitionSlug: string; stallId: string }>;
}) {
  const { exhibitionSlug, stallId } = await params;
  return <BookingFlow slug={exhibitionSlug} stallId={stallId} />;
}
