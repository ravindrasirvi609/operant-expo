"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CalendarRange, Grid3x3, Receipt, Timer } from "lucide-react";

import { useOrganization } from "@/components/providers/organization-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiGet } from "@/lib/http/client";

type Summary = {
  exhibitionCount: number;
  totalStalls: number;
  occupancyRate: number;
  stallsByStatus: Record<string, number>;
  activeHolds: number;
  pendingBookings: number;
  confirmedBookings: number;
  grossConfirmed: number;
};

const QUICK_LINKS = [
  { href: "/dashboard/exhibitions", label: "Manage exhibitions", icon: CalendarRange },
  { href: "/dashboard/stalls", label: "Manage stalls", icon: Grid3x3 },
  { href: "/dashboard/bookings", label: "Review bookings", icon: Receipt },
  { href: "/dashboard/holds", label: "View live holds", icon: Timer },
];

function SummarySkeleton() {
  return (
    <div className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { organizationId, organization, loading: organizationsLoading, error: organizationsError } = useOrganization();
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!organizationId) {
      // No organization selected yet — either still loading the list, or the user has none.
      setSummary(null);
      setLoading(organizationsLoading);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void apiGet<Summary>(`/api/organizations/${organizationId}/summary`).then((result) => {
      // A fast organization switch can land two responses out of order; ignore the stale one.
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else setSummary(result.data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId, organizationsLoading]);

  const stallStatuses = ["AVAILABLE", "HELD", "PENDING", "BOOKED", "BLOCKED"] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <SectionEyebrow>Organizer workspace</SectionEyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">Overview</h1>
        {organization && (
          <p className="text-sm text-[var(--ink-soft)]">
            {organization.name} · your role is {organization.role.toLowerCase().replace(/_/g, " ")}
          </p>
        )}
      </div>
      <DimensionDivider className="mt-6" />

      {organizationsError && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load your workspaces</AlertTitle>
          <AlertDescription>{organizationsError}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load this workspace</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <SummarySkeleton />
      ) : !organizationId ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="Create your first organization"
          description="An organization holds your exhibitions, halls, stalls and bookings. You can create more later for other teams."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : summary ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Exhibitions" value={summary.exhibitionCount} />
            <StatCard label="Total stalls" value={summary.totalStalls} />
            <StatCard
              label="Occupancy"
              value={`${summary.occupancyRate}%`}
              hint={`${summary.stallsByStatus.BOOKED ?? 0} booked`}
            />
            <StatCard label="Active holds" value={summary.activeHolds} hint="Countdown in progress" />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending confirmation" value={summary.pendingBookings} />
            <StatCard label="Confirmed bookings" value={summary.confirmedBookings} />
            <StatCard label="Gross confirmed" value={summary.grossConfirmed.toLocaleString()} />
            <Card className="corner-marks flex flex-col justify-center gap-2 p-5">
              {stallStatuses.map((status) => (
                <div key={status} className="flex w-full items-center justify-between gap-2">
                  <StatusBadge status={status} />
                  <span className="font-mono text-sm tabular text-[var(--ink)]">
                    {summary.stallsByStatus[status] ?? 0}
                  </span>
                </div>
              ))}
            </Card>
          </div>

          {summary.totalStalls === 0 && (
            <Alert variant="info" className="mt-6">
              <AlertTitle>No bookable stalls yet</AlertTitle>
              <AlertDescription>
                Add a hall to an exhibition, then design its floor plan to place and price stalls. Visitors can only
                book stalls that exist on a published plan.
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <Button key={link.href} asChild variant="outline">
                <Link href={link.href}>
                  <link.icon aria-hidden />
                  {link.label}
                </Link>
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
