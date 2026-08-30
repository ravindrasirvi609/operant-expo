"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Lock, MapPin } from "lucide-react";

import { MapViewer, type ViewerElement } from "@/components/exhibition-map/viewer";
import { StallSheet } from "@/components/public/stall-sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import type { PublicExhibitionView } from "@/lib/booking/public-exhibition";

/** Serialised form of the view: dates arrive as strings over the wire and from the server component. */
export type SerializedView = Omit<PublicExhibitionView, "exhibition" | "yourHold"> & {
  exhibition: Omit<PublicExhibitionView["exhibition"], "startDate" | "endDate"> & {
    startDate: string;
    endDate: string;
  };
  yourHold: { stallId: string; stallNumber: string; expiresAt: string } | null;
};

function remainingSeconds(expiresAt: string) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/** The bar offering to finish a reservation the visitor already started. */
function ResumeBar({
  hold,
  href,
}: {
  hold: NonNullable<SerializedView["yourHold"]>;
  href: string;
}) {
  const [seconds, setSeconds] = React.useState(() => remainingSeconds(hold.expiresAt));

  React.useEffect(() => {
    const timer = setInterval(() => setSeconds(remainingSeconds(hold.expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [hold.expiresAt]);

  if (seconds === 0) return null;

  return (
    <Alert variant="warning" className="mt-6">
      <AlertTitle>You are reserving stall {hold.stallNumber}</AlertTitle>
      <AlertDescription>
        <span className="flex flex-wrap items-center gap-3">
          <span>
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} left to complete your details.
          </span>
          <Button asChild size="sm">
            <Link href={href}>Continue booking</Link>
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

/** Lifecycle banner. This is the state that made the old flow look broken, so it is stated plainly. */
function LifecycleBanner({ view }: { view: SerializedView }) {
  if (view.bookingOpen) return null;

  const closed = view.exhibition.lifecycle === "BOOKING_CLOSED";
  return (
    <Alert variant="info" className="mt-6">
      <AlertTitle>{closed ? "Booking has closed" : "Booking has not opened yet"}</AlertTitle>
      <AlertDescription>
        {closed
          ? "You can still browse the floor plan, but no new stalls can be reserved. Contact the organizer if you need a space."
          : "You can browse the floor plan now. Stalls become reservable when the organizer opens booking."}
      </AlertDescription>
    </Alert>
  );
}

/**
 * The public exhibition page.
 *
 * Availability comes decided from the server, so a rectangle is clickable only when the API would
 * actually accept a reservation for it. Previously the map let a visitor click almost anything and
 * the hold endpoint refused with "Stall is not available" — including on an exhibition whose booking
 * had simply not been opened yet, which the page never mentioned.
 */
export function ExhibitionView({
  view,
  bookingBasePath = "/exhibitions",
  compact = false,
}: {
  view: SerializedView;
  bookingBasePath?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [selectedStallId, setSelectedStallId] = React.useState<string | null>(null);

  const { exhibition, halls, totals, yourHold } = view;
  const hasAnyPlan = halls.some((hall) => hall.canvas !== null);

  return (
    <main className={compact ? "px-4 py-6" : "mx-auto max-w-7xl px-4 py-10 sm:px-6"}>
      <div className="max-w-3xl">
        {!compact && <SectionEyebrow>Exhibition booking</SectionEyebrow>}
        <h1
          className={
            compact
              ? "font-display text-2xl font-semibold tracking-tight text-[var(--ink)]"
              : "mt-2 font-display text-4xl font-semibold tracking-tight text-[var(--ink)]"
          }
        >
          {exhibition.name}
        </h1>
        {exhibition.shortDescription && !compact && (
          <p className="mt-3 text-[var(--ink-soft)]">{exhibition.shortDescription}</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-[var(--ink-soft)]">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" aria-hidden />
            {new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden />
            {totals.available} of {totals.total} stalls available
          </span>
        </p>
      </div>

      <LifecycleBanner view={view} />

      {yourHold && <ResumeBar hold={yourHold} href={`${bookingBasePath}/${exhibition.slug}/book/${yourHold.stallId}`} />}

      {!compact && <DimensionDivider className="mt-8" />}

      {!hasAnyPlan ? (
        <EmptyState
          className="mt-8"
          icon={Lock}
          title="The floor plan is not published yet"
          description="The organizer is still laying out this exhibition. Check back shortly."
        />
      ) : (
        <div className={compact ? "mt-6 space-y-8" : "mt-8 space-y-10"}>
          {halls.map((hall) => {
            const elements: ViewerElement[] = hall.elements.map((element) => ({
              id: element.id,
              type: element.type,
              label: element.label,
              geometry: element.geometry,
              stallId: element.stallId,
              status: element.status,
              bookable: element.bookable,
              reason: element.reason,
            }));

            return (
              <Card key={hall.id} className={compact ? "border-0 p-0 shadow-none" : "corner-marks p-6"}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2
                      className={
                        compact
                          ? "font-display text-lg font-semibold text-[var(--ink)]"
                          : "font-display text-2xl font-semibold text-[var(--ink)]"
                      }
                    >
                      {hall.name}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {hall.stalls.length} stall{hall.stalls.length === 1 ? "" : "s"}
                      {view.bookingOpen
                        ? " · select an available one to see its details"
                        : " · browsing only until booking opens"}
                    </p>
                  </div>
                </div>

                {hall.canvas ? (
                  <div className="mt-5">
                    <MapViewer
                      width={hall.canvas.width}
                      height={hall.canvas.height}
                      backgroundUrl={hall.backgroundUrl}
                      elements={elements}
                      selectedStallId={selectedStallId ?? undefined}
                      // Read-only until booking opens: a map you cannot buy from should not pretend
                      // otherwise by offering clickable stalls.
                      onSelectStall={view.bookingOpen ? (stallId) => setSelectedStallId(stallId) : undefined}
                    />
                  </div>
                ) : (
                  <p className="mt-5 text-[var(--ink-soft)]">This hall has not published a floor plan yet.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <StallSheet
        slug={exhibition.slug}
        stallId={selectedStallId}
        bookingBasePath={bookingBasePath}
        onClose={() => setSelectedStallId(null)}
        // Availability may have moved on while the sheet was open, so re-read the server's view.
        onReserved={() => router.refresh()}
      />
    </main>
  );
}
