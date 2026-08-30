"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";

import { MapViewer } from "@/components/exhibition-map/viewer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/http/client";
import type { useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

/**
 * Step 4: check, preview, publish.
 *
 * The preview renders through the very component visitors use, so what is approved here is what
 * ships — a separate approximation would be free to disagree with the real thing.
 *
 * It also offers to open booking, because a published plan on a merely-published exhibition is the
 * state where a visitor can click a stall and be told it is unavailable with no explanation.
 */
export function ReviewStep({
  api,
  exhibition,
  organizationId,
}: {
  api: PlanApi;
  exhibition: { _id: string; name: string; slug: string; lifecycle: string } | null;
  organizationId: string;
}) {
  const [publishing, setPublishing] = React.useState(false);
  const [openingBooking, setOpeningBooking] = React.useState(false);

  const checks = api.readiness;
  const failing = checks.filter((check) => !check.ok);
  const ready = checks.length > 0 && failing.length === 0;
  const plan = api.plan;

  async function publish() {
    setPublishing(true);
    const result = await api.publish();
    setPublishing(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Floor plan published.", {
      description:
        exhibition && exhibition.lifecycle !== "BOOKING_OPEN"
          ? "Open booking below to let visitors reserve stalls."
          : "Visitors can reserve stalls now.",
    });
  }

  async function openBooking() {
    if (!exhibition) return;
    setOpeningBooking(true);
    const result = await apiRequest(
      `/api/organizations/${organizationId}/exhibitions/${exhibition._id}/lifecycle`,
      { method: "POST", json: { lifecycle: "BOOKING_OPEN" } },
    );
    setOpeningBooking(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Booking is open.", { description: "Visitors can reserve stalls from the public page." });
  }

  const viewerElements = api.elements.map((element) => {
    const stall = api.stallByElementId.get(element._id);
    return {
      _id: element._id,
      type: element.type,
      label: stall?.stallNumber ?? element.label,
      geometry: element.geometry,
      visible: element.visible,
      stallId: stall?._id,
      status: stall?.status,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Readiness</CardTitle>
            <CardDescription>Everything here must pass before visitors can be shown this plan.</CardDescription>
          </CardHeader>
          <ul className="space-y-3 px-6 pb-6">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3">
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: check.ok ? "var(--status-available)" : "var(--status-booked)",
                    color: "white",
                  }}
                  aria-hidden
                >
                  {check.ok ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)]">{check.label}</p>
                  {check.detail && <p className="text-xs text-[var(--ink-soft)]">{check.detail}</p>}
                </div>
              </li>
            ))}
            {checks.length === 0 && (
              <li className="text-sm text-[var(--ink-soft)]">Create the canvas and place a stall to see the checklist.</li>
            )}
          </ul>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Publish</CardTitle>
            <CardDescription>
              {plan?.status === "PUBLISHED"
                ? `Live at revision ${plan.revision}.`
                : "Not visible to visitors yet."}
            </CardDescription>
          </CardHeader>
          <div className="space-y-3 px-6 pb-6">
            <div className="flex items-center gap-2">
              <StatusBadge status={plan?.status ?? "DRAFT"} />
              {exhibition && <StatusBadge status={exhibition.lifecycle} />}
            </div>

            <Button onClick={() => void publish()} loading={publishing} disabled={!ready} className="w-full">
              {plan?.status === "PUBLISHED" ? "Republish plan" : "Publish plan"}
            </Button>
            {!ready && checks.length > 0 && (
              <p className="text-xs text-[var(--ink-faint)]">
                {failing.length} item{failing.length === 1 ? "" : "s"} still to fix.
              </p>
            )}

            {plan?.status === "PUBLISHED" && exhibition && exhibition.lifecycle !== "BOOKING_OPEN" && (
              <Alert variant="warning">
                <AlertTitle>Booking is not open</AlertTitle>
                <AlertDescription>
                  Visitors can see this map but cannot reserve anything. Open booking to accept reservations.
                  <span className="mt-2 block">
                    <Button size="sm" onClick={() => void openBooking()} loading={openingBooking}>
                      Open booking
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            )}

            {exhibition && ["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"].includes(exhibition.lifecycle) && (
              <Button asChild variant="outline" className="w-full">
                <Link href={`/exhibitions/${exhibition.slug}`} target="_blank">
                  <ExternalLink aria-hidden />
                  View public page
                </Link>
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold text-[var(--ink)]">Visitor preview</h3>
        <p className="mt-1 text-sm text-[var(--ink-soft)]">
          Rendered with the same component the public page uses. Clicking a stall here does nothing.
        </p>
        {plan && (
          <div className="mt-4">
            <MapViewer
              width={plan.canvasWidth}
              height={plan.canvasHeight}
              backgroundUrl={api.background?.url}
              elements={viewerElements}
              interactive={false}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
