"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Timer } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganization } from "@/components/providers/organization-provider";
import { useOrgResource } from "@/lib/ui/use-org-resource";

type Hold = {
  _id: string;
  expiresAt: string;
  createdAt: string;
  stall: { stallNumber: string; basePrice: number; currency: string } | null;
  exhibition: { name: string; slug: string } | null;
};

function remainingSeconds(expiresAt: string) {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  // Seeded from the timestamp rather than starting at zero, so the first render already shows
  // the true remaining time instead of flashing 0:00 for a second.
  const [seconds, setSeconds] = React.useState(() => remainingSeconds(expiresAt));

  React.useEffect(() => {
    const timer = setInterval(() => setSeconds(remainingSeconds(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const expired = seconds === 0;
  return (
    <span
      className="font-mono text-sm tabular"
      style={{ color: expired ? "var(--ink-faint)" : "var(--status-held-ink)" }}
    >
      {expired ? "releasing…" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`}
    </span>
  );
}

export default function HoldsPage() {
  // Holds are short-lived by nature, so this screen polls. A failed background poll keeps the
  // last good list on screen instead of blanking the table mid-read.
  const { organizationId } = useOrganization();
  const { data, loading, error, noOrganizations } = useOrgResource<{ holds: Hold[] }>(
    organizationId ? `/api/organizations/${organizationId}/holds` : null,
    { refreshMs: 15_000 },
  );

  const holds = data?.holds ?? [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <SectionEyebrow>Organizer workspace</SectionEyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)]">Live holds</h1>
        <p className="text-[var(--ink-soft)]">
          Stalls a visitor is currently reserving. Each hold releases automatically when its countdown ends.
        </p>
      </div>
      <DimensionDivider className="mt-6" />

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load holds</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {noOrganizations ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="No organization yet"
          description="Create an organization to start tracking reservations."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : (
        <Card className="mt-6 overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10" />
              ))}
            </div>
          ) : holds.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={Timer}
              title="No active holds"
              description="When a visitor reserves a stall, it appears here with the time remaining before it is released."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stall</TableHead>
                  <TableHead>Exhibition</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Held since</TableHead>
                  <TableHead className="text-right">Time left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holds.map((hold) => (
                  <TableRow key={hold._id}>
                    <TableCell className="font-mono font-medium text-[var(--ink)]">
                      {hold.stall?.stallNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      {hold.exhibition ? (
                        <Link
                          href={`/exhibitions/${hold.exhibition.slug}`}
                          target="_blank"
                          className="text-[var(--ink)] hover:underline"
                        >
                          {hold.exhibition.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--ink-faint)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono tabular">
                      {hold.stall ? `${hold.stall.basePrice.toLocaleString()} ${hold.stall.currency}` : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-[var(--ink-soft)]">
                      {new Date(hold.createdAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Countdown key={hold.expiresAt} expiresAt={hold.expiresAt} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </main>
  );
}
