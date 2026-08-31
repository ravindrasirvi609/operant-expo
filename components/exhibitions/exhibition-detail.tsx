"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  LayoutTemplate,
  Receipt,
  Timer,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";

import { EmbedCodePanel } from "@/components/dashboard/embed-code-panel";
import { HallManager } from "@/components/exhibitions/hall-manager";
import { InventoryTable } from "@/components/stalls/inventory-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/http/client";
import { useFloorPlan } from "@/lib/ui/use-floor-plan";
import { useOrgResource } from "@/lib/ui/use-org-resource";

type HallSummary = {
  id: string;
  name: string;
  code: string;
  width: number;
  height: number;
  publicVisibility: boolean;
  planStatus: "DRAFT" | "PUBLISHED" | null;
  planRevision: number | null;
  stalls: number;
  unpriced: number;
  stallsByStatus: Record<string, number>;
};

type Summary = {
  exhibition: {
    _id: string;
    name: string;
    slug: string;
    shortDescription?: string;
    lifecycle: string;
    startDate: string;
    endDate: string;
    timezone: string;
  };
  halls: HallSummary[];
  totals: {
    halls: number;
    publishedPlans: number;
    totalStalls: number;
    unpricedStalls: number;
    bookedStalls: number;
    occupancyRate: number;
    activeHolds: number;
    pendingBookings: number;
    confirmedBookings: number;
    grossConfirmed: number;
    grossPending: number;
  };
};

/** The one lifecycle step offered from each state, and what it means for visitors. */
const NEXT_STEP: Record<string, { target: string; label: string; note: string }> = {
  DRAFT: {
    target: "PUBLISHED",
    label: "Publish exhibition",
    note: "Nobody can see this yet. Needs at least one active hall.",
  },
  PUBLISHED: {
    target: "BOOKING_OPEN",
    label: "Open booking",
    note: "Visitors can browse the floor plan but cannot reserve anything.",
  },
  BOOKING_OPEN: {
    target: "BOOKING_CLOSED",
    label: "Close booking",
    note: "Visitors can reserve and book stalls right now.",
  },
  BOOKING_CLOSED: {
    target: "BOOKING_OPEN",
    label: "Reopen booking",
    note: "The map is visible, but no new bookings are accepted.",
  },
};

const PUBLIC_LIFECYCLES = new Set(["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"]);

/** Stall inventory for whichever hall is chosen, reusing the shared table. */
function StallsTab({
  organizationId,
  exhibitionId,
  halls,
  canManage,
}: {
  organizationId: string;
  exhibitionId: string;
  halls: HallSummary[];
  canManage: boolean;
}) {
  const [pickedHallId, setPickedHallId] = React.useState("");
  const hallId = pickedHallId && halls.some((hall) => hall.id === pickedHallId) ? pickedHallId : (halls[0]?.id ?? "");
  const plan = useFloorPlan({ organizationId, exhibitionId, hallId });

  if (halls.length === 0) {
    return (
      <EmptyState
        icon={Warehouse}
        title="No halls yet"
        description="Stalls live in a hall. Add one on the halls tab first."
      />
    );
  }

  return (
    <div className="space-y-4">
      {halls.length > 1 && (
        <Select value={hallId} onValueChange={setPickedHallId}>
          <SelectTrigger size="sm" className="w-64" aria-label="Hall">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {halls.map((hall) => (
              <SelectItem key={hall.id} value={hall.id}>
                {hall.name} · {hall.stalls} stalls
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <InventoryTable
        organizationId={organizationId}
        floorPlanId={plan.plan?._id ?? null}
        stalls={plan.stalls}
        loading={plan.loading}
        planHref={`/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/plan`}
        canManage={canManage}
        onChanged={async () => {
          await plan.reload();
        }}
        title={halls.find((hall) => hall.id === hallId)?.name ?? "Stall inventory"}
      />
    </div>
  );
}

/**
 * Everything about one exhibition, in tabs.
 *
 * The exhibitions list used to do all of this inline: selecting an event expanded a hall panel
 * beneath it, and stalls and bookings lived on entirely separate screens with their own organization
 * and exhibition pickers. Here the exhibition is the subject of the page, and each tab is one job.
 */
export function ExhibitionDetail({
  organizationId,
  exhibitionId,
  canManage,
}: {
  organizationId: string;
  exhibitionId: string;
  canManage: boolean;
}) {
  const { data, loading, error, reload } = useOrgResource<Summary>(
    `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/summary`,
  );
  const [saving, setSaving] = React.useState(false);

  const exhibition = data?.exhibition;
  const halls = data?.halls ?? [];
  const totals = data?.totals;
  const step = exhibition ? NEXT_STEP[exhibition.lifecycle] : undefined;

  async function changeLifecycle(target: string, label: string) {
    setSaving(true);
    const result = await apiRequest(
      `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/lifecycle`,
      { method: "POST", json: { lifecycle: target } },
    );
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${label} done.`);
    await reload();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="mt-8 h-64" />
      </main>
    );
  }

  if (error || !exhibition || !totals) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this exhibition</AlertTitle>
          <AlertDescription>{error || "It may have been deleted."}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/dashboard/exhibitions">
            <ArrowLeft aria-hidden />
            Back to exhibitions
          </Link>
        </Button>
      </main>
    );
  }

  const isPublic = PUBLIC_LIFECYCLES.has(exhibition.lifecycle);
  const readyToPublishPlans = totals.publishedPlans > 0;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/exhibitions">
          <ArrowLeft aria-hidden />
          Exhibitions
        </Link>
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <SectionEyebrow>Exhibition</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            {exhibition.name}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm text-[var(--ink-soft)]">
            <span>/{exhibition.slug}</span>
            <span>
              {new Date(exhibition.startDate).toLocaleDateString()} –{" "}
              {new Date(exhibition.endDate).toLocaleDateString()}
            </span>
            <span>{exhibition.timezone}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={exhibition.lifecycle} />
          {isPublic && (
            <Button asChild size="sm" variant="outline">
              <a href={`/exhibitions/${exhibition.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Public page
              </a>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="halls">
            Halls
            <span className="font-mono text-xs tabular opacity-70">{totals.halls}</span>
          </TabsTrigger>
          <TabsTrigger value="stalls">
            Stalls
            <span className="font-mono text-xs tabular opacity-70">{totals.totalStalls}</span>
          </TabsTrigger>
          <TabsTrigger value="share">Share</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {step && canManage && (
            <Card className="corner-marks p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-display font-semibold text-[var(--ink)]">Next step</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{step.note}</p>
                </div>
                <Button loading={saving} onClick={() => void changeLifecycle(step.target, step.label)}>
                  {step.label}
                </Button>
              </div>
            </Card>
          )}

          {totals.unpricedStalls > 0 && (
            <Alert variant="warning">
              <AlertTitle>
                {totals.unpricedStalls} stall{totals.unpricedStalls === 1 ? "" : "s"} have no price
              </AlertTitle>
              <AlertDescription>
                A floor plan cannot be published until every stall has one. Set them on the stalls tab.
              </AlertDescription>
            </Alert>
          )}

          {totals.halls > 0 && !readyToPublishPlans && (
            <Alert variant="info">
              <AlertTitle>No floor plan is published yet</AlertTitle>
              <AlertDescription>
                Visitors see an empty exhibition until at least one hall has a published plan.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Halls" value={totals.halls} hint={`${totals.publishedPlans} published`} />
            <StatCard label="Stalls" value={totals.totalStalls} hint={`${totals.bookedStalls} booked`} />
            <StatCard label="Occupancy" value={`${totals.occupancyRate}%`} />
            <StatCard label="Active holds" value={totals.activeHolds} hint="Reserving right now" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending confirmation" value={totals.pendingBookings} />
            <StatCard label="Confirmed" value={totals.confirmedBookings} />
            <StatCard label="Gross confirmed" value={totals.grossConfirmed.toLocaleString()} />
            <StatCard label="Gross pending" value={totals.grossPending.toLocaleString()} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/bookings">
                <Receipt aria-hidden />
                Review bookings
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/holds">
                <Timer aria-hidden />
                Live holds
              </Link>
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="halls" className="mt-6 space-y-4">
          {halls.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-[var(--line)]">
                <CardTitle>Floor plans</CardTitle>
                <CardDescription>One plan per hall. Publish it to make its stalls bookable.</CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hall</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Stalls</TableHead>
                    <TableHead>Public</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {halls.map((hall) => (
                    <TableRow key={hall.id}>
                      <TableCell className="font-medium text-[var(--ink)]">
                        {hall.name}
                        <span className="ml-2 font-mono text-xs text-[var(--ink-faint)]">{hall.code}</span>
                      </TableCell>
                      <TableCell className="font-mono tabular whitespace-nowrap">
                        {hall.width} × {hall.height} m
                      </TableCell>
                      <TableCell>
                        {hall.planStatus ? (
                          <span className="flex items-center gap-2">
                            <StatusBadge status={hall.planStatus} />
                            {hall.planRevision ? (
                              <span className="font-mono text-xs text-[var(--ink-faint)]">r{hall.planRevision}</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-sm text-[var(--ink-faint)]">not started</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono tabular">
                        {hall.stalls}
                        {hall.unpriced > 0 && (
                          <span className="ml-2 text-xs" style={{ color: "var(--status-booked-ink)" }}>
                            {hall.unpriced} unpriced
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {hall.publicVisibility ? (
                          <CheckCircle2 className="size-4" style={{ color: "var(--status-available)" }} aria-label="Public" />
                        ) : (
                          <span className="text-sm text-[var(--ink-faint)]">hidden</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm">
                          <Link href={`/dashboard/exhibitions/${exhibitionId}/halls/${hall.id}/plan`}>
                            <LayoutTemplate aria-hidden />
                            {hall.stalls === 0 ? "Design plan" : "Edit plan"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {canManage ? (
            <HallManager
              organizationId={organizationId}
              exhibitionId={exhibitionId}
              exhibitionName={exhibition.name}
            />
          ) : (
            <Alert variant="info">
              <AlertTitle>Read-only access</AlertTitle>
              <AlertDescription>Your role can view halls but not add them.</AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="stalls" className="mt-6">
          <StallsTab
            organizationId={organizationId}
            exhibitionId={exhibitionId}
            halls={halls}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="share" className="mt-6 space-y-4">
          {isPublic ? (
            <Card className="p-6">
              <h2 className="font-display font-semibold text-[var(--ink)]">Embed the booking widget</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Drop this into your own site. It resizes itself and keeps visitors on your page.
              </p>
              <div className="mt-4">
                <EmbedCodePanel slug={exhibition.slug} name={exhibition.name} />
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={ExternalLink}
              title="Publish the exhibition to share it"
              description="An unpublished exhibition has no public page, so there is nothing to embed yet."
              action={
                step && canManage ? (
                  <Button loading={saving} onClick={() => void changeLifecycle(step.target, step.label)}>
                    {step.label}
                  </Button>
                ) : undefined
              }
            />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
