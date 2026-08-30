"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatWaitHint, type Availability } from "@/lib/booking/availability";
import { apiGet, apiRequest } from "@/lib/http/client";
import { STALL_TYPE_LABELS, type STALL_TYPES } from "@/lib/validation/map";

type StallDetail = {
  stall: {
    id: string;
    stallNumber: string;
    section?: string;
    stallType: string;
    width: number;
    height: number;
    areaLabel: string;
    basePrice: number;
    currency: string;
    amenities: string[];
    description?: string;
    hallName: string | null;
  };
  availability: Availability;
  yourHold: { expiresAt: string } | null;
};

function money(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

/**
 * What a visitor sees before committing to anything.
 *
 * Clicking a stall used to navigate straight to a form that asked for company details without ever
 * naming the stall, its size or its price — and which silently reserved it on arrival. Here the
 * details come first and nothing is held until the visitor asks.
 */
export function StallSheet({
  slug,
  stallId,
  bookingBasePath,
  onClose,
  onReserved,
}: {
  slug: string;
  stallId: string | null;
  bookingBasePath: string;
  onClose: () => void;
  onReserved: () => void;
}) {
  return (
    <Sheet open={Boolean(stallId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {/* Keyed by stall so choosing a different one remounts with fresh state, rather than an
            effect clearing the previous stall's details on the way in. */}
        {stallId && (
          <StallSheetBody
            key={stallId}
            slug={slug}
            stallId={stallId}
            bookingBasePath={bookingBasePath}
            onClose={onClose}
            onReserved={onReserved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StallSheetBody({
  slug,
  stallId,
  bookingBasePath,
  onClose,
  onReserved,
}: {
  slug: string;
  stallId: string;
  bookingBasePath: string;
  onClose: () => void;
  onReserved: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<StallDetail | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [reserving, setReserving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void apiGet<StallDetail>(`/api/public/exhibitions/${slug}/stalls/${stallId}`).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, stallId]);

  async function reserve() {
    if (!stallId) return;
    setReserving(true);
    const result = await apiRequest<{ hold: { expiresAt: string; resumed: boolean } }>(
      `/api/public/exhibitions/${slug}/stalls/${stallId}/hold`,
      { method: "POST" },
    );
    setReserving(false);

    if (!result.ok) {
      toast.error(result.error);
      // The map's colours may now be stale — someone else may have taken it a moment ago.
      onReserved();
      return;
    }

    toast.success(result.data.hold.resumed ? "Continuing your reservation." : "Stall reserved for you.", {
      description: "Complete your details before the timer runs out.",
    });
    router.push(`${bookingBasePath}/${slug}/book/${stallId}`);
  }

  const availability = detail?.availability;
  const waitHint = formatWaitHint(availability?.availableInSeconds);
  const isYours = availability?.reason === "HELD_BY_YOU";

  return (
    <>
      {!detail && !loadError && (
          <div className="space-y-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-32" />
          </div>
        )}

        {loadError && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load this stall</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {detail && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-2xl">{detail.stall.stallNumber}</SheetTitle>
                {availability && (
                  <StatusBadge
                    status={
                      availability.reason === "AVAILABLE" || availability.reason === "HELD_BY_YOU"
                        ? "AVAILABLE"
                        : availability.reason === "HELD_BY_OTHER"
                          ? "HELD"
                          : availability.reason === "PENDING_PAYMENT"
                            ? "PENDING"
                            : availability.reason === "BOOKED"
                              ? "BOOKED"
                              : "BLOCKED"
                    }
                  />
                )}
              </div>
              <SheetDescription>
                {[detail.stall.hallName, detail.stall.section ? `Section ${detail.stall.section}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </SheetDescription>
            </SheetHeader>

            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[var(--ink-soft)]">Price</dt>
                <dd className="font-display text-xl font-semibold text-[var(--ink)]">
                  {money(detail.stall.basePrice, detail.stall.currency)}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ink-soft)]">Size</dt>
                <dd className="font-mono text-[var(--ink)]">
                  {detail.stall.width} × {detail.stall.height} m · {detail.stall.areaLabel}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--ink-soft)]">Type</dt>
                <dd className="text-[var(--ink)]">
                  {STALL_TYPE_LABELS[detail.stall.stallType as (typeof STALL_TYPES)[number]] ?? detail.stall.stallType}
                </dd>
              </div>
              {detail.stall.amenities.length > 0 && (
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-[var(--ink-soft)]">Included</dt>
                  <dd className="flex flex-wrap justify-end gap-1.5">
                    {detail.stall.amenities.map((amenity) => (
                      <Badge key={amenity} variant="muted">
                        {amenity}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
              {detail.stall.description && (
                <>
                  <Separator />
                  <p className="text-[var(--ink-soft)]">{detail.stall.description}</p>
                </>
              )}
            </dl>

            {availability && !availability.bookable && (
              <Alert variant={availability.reason === "BOOKED" ? "destructive" : "warning"}>
                <AlertTitle>Not available</AlertTitle>
                <AlertDescription>
                  {availability.message}
                  {waitHint ? ` ${waitHint}` : ""}
                </AlertDescription>
              </Alert>
            )}

            <SheetFooter>
              {availability?.bookable ? (
                <>
                  <Button size="lg" className="w-full" onClick={() => void reserve()} loading={reserving}>
                    {reserving && <Loader2 className="animate-spin" aria-hidden />}
                    {isYours ? "Continue your reservation" : "Reserve for 15 minutes"}
                  </Button>
                  <p className="text-center text-xs text-[var(--ink-faint)]">
                    {isYours
                      ? "You already hold this stall. Nothing new is reserved."
                      : "Holds it while you fill in your details. No payment is taken now."}
                  </p>
                </>
              ) : (
                <Button variant="outline" className="w-full" onClick={onClose}>
                  Look at another stall
                </Button>
              )}
            </SheetFooter>
        </>
      )}
    </>
  );
}
