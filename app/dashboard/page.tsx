"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";

type Organization = { _id: string; name: string };
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

export default function DashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/organizations/${id}/summary`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load workspace summary");
      setSummary(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workspace summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/me/organizations")
      .then((response) => response.json())
      .then((data) => {
        setOrganizations(data.organizations ?? []);
        const first = data.organizations?.[0];
        if (first) {
          setOrganizationId(first._id);
          void load(first._id);
        } else setLoading(false);
      })
      .catch(() => {
        setError("Unable to load organizations");
        setLoading(false);
      });
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Organizer workspace</SectionEyebrow>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-[var(--ink)]">Overview</h1>
        </div>
        {organizations.length > 0 && (
          <select
            aria-label="Organization"
            value={organizationId}
            onChange={(event) => { setOrganizationId(event.target.value); void load(event.target.value); }}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--paper-raised)] px-3 py-2 text-sm"
          >
            {organizations.map((organization) => <option key={organization._id} value={organization._id}>{organization.name}</option>)}
          </select>
        )}
      </div>
      <DimensionDivider className="mt-6" />

      {error && <p role="alert" className="mt-6 rounded-md border border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] p-3 text-sm text-[var(--booked)]">{error}</p>}

      {loading ? (
        <p className="mt-8 text-[var(--ink-soft)]">Loading workspace…</p>
      ) : organizations.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--line-strong)] p-12 text-center text-[var(--ink-soft)]">
          No organization yet. <Link href="/dashboard/organizations/new" className="font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">Create one</Link> to get started.
        </div>
      ) : summary ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Exhibitions" value={summary.exhibitionCount} />
            <StatCard label="Total stalls" value={summary.totalStalls} />
            <StatCard label="Occupancy" value={`${summary.occupancyRate}%`} hint={`${summary.stallsByStatus.BOOKED ?? 0} booked`} />
            <StatCard label="Active holds" value={summary.activeHolds} hint="Countdown in progress" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Pending confirmation" value={summary.pendingBookings} />
            <StatCard label="Confirmed bookings" value={summary.confirmedBookings} />
            <StatCard label="Gross confirmed" value={summary.grossConfirmed.toLocaleString()} />
            <div className="corner-marks flex flex-col items-start justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper-raised)] p-5">
              {(["AVAILABLE", "HELD", "BOOKED", "BLOCKED"] as const).map((status) => (
                <div key={status} className="flex w-full items-center justify-between">
                  <StatusBadge status={status} />
                  <span className="font-mono text-sm tabular text-[var(--ink)]">{summary.stallsByStatus[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard/exhibitions" className="rounded-md border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink)]">Manage exhibitions →</Link>
            <Link href="/dashboard/stalls" className="rounded-md border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink)]">Manage stalls →</Link>
            <Link href="/dashboard/bookings" className="rounded-md border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink)]">Review bookings →</Link>
            <Link href="/dashboard/holds" className="rounded-md border border-[var(--line-strong)] px-4 py-2 text-sm font-medium text-[var(--ink)]">View live holds →</Link>
          </div>
        </>
      ) : null}
    </main>
  );
}
