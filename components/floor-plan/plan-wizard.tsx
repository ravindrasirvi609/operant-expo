"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { CanvasStep } from "@/components/floor-plan/canvas-step";
import { LayoutStep } from "@/components/floor-plan/layout-step";
import { PricingStep } from "@/components/floor-plan/pricing-step";
import { ReviewStep } from "@/components/floor-plan/review-step";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Stepper, type Step } from "@/components/ui/stepper";
import { apiGet } from "@/lib/http/client";
import { useFloorPlan } from "@/lib/ui/use-floor-plan";

const STEPS: Step[] = [
  { id: "canvas", title: "Canvas", hint: "Size and background" },
  { id: "layout", title: "Layout", hint: "Place and price stalls" },
  { id: "pricing", title: "Inventory", hint: "Review every stall" },
  { id: "review", title: "Publish", hint: "Check and go live" },
];

type Exhibition = { _id: string; name: string; slug: string; lifecycle: string };

/**
 * The floor-plan wizard.
 *
 * Replaces three disconnected screens — an upload form that demanded a background image, a viewer,
 * and an editor nothing linked to — with one ordered flow. Step position is derived from the plan's
 * own state rather than stored, so leaving and returning lands the organizer where the work is.
 */
export function PlanWizard({
  organizationId,
  exhibitionId,
  hallId,
}: {
  organizationId: string;
  exhibitionId: string;
  hallId: string;
}) {
  const api = useFloorPlan({ organizationId, exhibitionId, hallId });
  const [exhibition, setExhibition] = React.useState<Exhibition | null>(null);
  const [stepId, setStepId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void apiGet<{ exhibition: Exhibition }>(
      `/api/organizations/${organizationId}/exhibitions/${exhibitionId}`,
    ).then((result) => {
      if (!cancelled && result.ok) setExhibition(result.data.exhibition);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, exhibitionId]);

  // How far the plan itself has progressed. An explicit click wins, but the default follows the
  // data, so returning to a hall with stalls already placed opens on the layout rather than the
  // canvas form the organizer finished with days ago.
  const furthestReachable = !api.plan ? 0 : api.stalls.length === 0 ? 1 : 3;
  const activeId = stepId ?? STEPS[Math.min(furthestReachable, api.stalls.length > 0 ? 1 : furthestReachable)].id;
  const activeIndex = Math.max(0, STEPS.findIndex((step) => step.id === activeId));

  function goTo(index: number) {
    setStepId(STEPS[Math.max(0, Math.min(STEPS.length - 1, index))].id);
  }

  if (api.loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-4 h-12 w-full" />
        <Skeleton className="mt-8 h-[60vh] w-full" />
      </main>
    );
  }

  if (api.loadError) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SectionEyebrow>Floor plan</SectionEyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">
          Couldn&apos;t open this floor plan
        </h1>
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Loading failed</AlertTitle>
          <AlertDescription>{api.loadError}</AlertDescription>
        </Alert>
        <div className="mt-6 flex gap-2">
          <Button variant="outline" onClick={() => void api.reload()}>
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard/exhibitions">Back to exhibitions</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionEyebrow>Floor plan</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">
            {api.hall?.name ?? "Hall"}
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {exhibition?.name ?? "Exhibition"}
            {api.hall ? ` · ${api.hall.width} x ${api.hall.height} m` : ""}
            {api.stalls.length > 0 ? ` · ${api.stalls.length} stalls` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {api.plan && <StatusBadge status={api.plan.status} />}
          {exhibition && <StatusBadge status={exhibition.lifecycle} />}
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/exhibitions">
              <ArrowLeft aria-hidden />
              Exhibitions
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-8 border-y border-[var(--line)] py-5">
        <Stepper
          steps={STEPS}
          currentId={activeId}
          furthestReachable={furthestReachable}
          onSelect={(id) => setStepId(id)}
        />
      </div>

      <div className="mt-8">
        {activeId === "canvas" && <CanvasStep api={api} onContinue={() => goTo(1)} />}
        {activeId === "layout" && <LayoutStep api={api} />}
        {activeId === "pricing" && <PricingStep api={api} organizationId={organizationId} />}
        {activeId === "review" && (
          <ReviewStep api={api} exhibition={exhibition} organizationId={organizationId} />
        )}
      </div>

      {activeId !== "canvas" && (
        <div className="mt-8 flex items-center justify-between border-t border-[var(--line)] pt-6">
          <Button variant="outline" onClick={() => goTo(activeIndex - 1)}>
            <ArrowLeft aria-hidden />
            {STEPS[Math.max(0, activeIndex - 1)].title}
          </Button>
          {activeIndex < STEPS.length - 1 && (
            <Button onClick={() => goTo(activeIndex + 1)} disabled={activeIndex >= furthestReachable}>
              {STEPS[activeIndex + 1].title}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
      )}
    </main>
  );
}
