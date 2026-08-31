"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CalendarRange } from "lucide-react";

import { useOrganization } from "@/components/providers/organization-provider";
import { CreateExhibitionForm, type Exhibition } from "@/components/exhibitions/create-exhibition-form";
import { CreateVenueForm, type Venue } from "@/components/exhibitions/create-venue-form";
import { ExhibitionCard } from "@/components/exhibitions/exhibition-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgResource } from "@/lib/ui/use-org-resource";

export default function ExhibitionsPage() {
  const { organizationId, loading: organizationsLoading, can } = useOrganization();

  // Read separately so a venues failure cannot blank the exhibition list, which is the part of
  // this screen that actually matters.
  const exhibitionResource = useOrgResource<{ exhibitions: Exhibition[] }>(
    organizationId ? `/api/organizations/${organizationId}/exhibitions` : null,
  );
  const venueResource = useOrgResource<{ venues: Venue[] }>(
    organizationId ? `/api/organizations/${organizationId}/venues` : null,
  );

  // Server-loaded exhibitions plus anything created or transitioned in this session, so the list
  // reflects a lifecycle change immediately without a full re-read.
  const [overrides, setOverrides] = React.useState<Exhibition[]>([]);

  const loading = exhibitionResource.loading;
  const error = exhibitionResource.error || venueResource.error;
  const venues = venueResource.data?.venues ?? [];

  const exhibitions = React.useMemo(() => {
    const loaded = exhibitionResource.data?.exhibitions ?? [];
    const byId = new Map(loaded.map((exhibition) => [exhibition._id, exhibition]));
    const created: Exhibition[] = [];
    for (const override of overrides) {
      if (byId.has(override._id)) byId.set(override._id, override);
      else created.push(override);
    }
    return [...created, ...Array.from(byId.values())];
  }, [exhibitionResource.data, overrides]);

  const canManage = can("exhibition:manage");

  function upsert(exhibition: Exhibition) {
    setOverrides((current) => [
      exhibition,
      ...current.filter((item) => item._id !== exhibition._id),
    ]);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2 border-b border-[var(--line)] pb-8">
        <SectionEyebrow>Organizer workspace</SectionEyebrow>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Exhibitions
        </h1>
        <p className="max-w-2xl text-[var(--ink-soft)]">
          Create an event, add its halls, design each floor plan, then publish and open booking. Visitors can only
          reserve stalls once booking is open on a published plan.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load everything</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!organizationId && !organizationsLoading ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="No organization yet"
          description="Exhibitions live inside an organization. Create one to get started."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Your exhibitions</h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Open one to manage its halls, floor plans and stalls.
                </p>
              </div>
              <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)]">
                {exhibitions.length} total
              </span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-40" />
                ))}
              </div>
            ) : exhibitions.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="No exhibitions yet"
                description="Create your first exhibition from the panel on the right. It starts as a private draft."
              />
            ) : (
              <div className="space-y-3">
                {exhibitions.map((exhibition) => (
                  <ExhibitionCard
                    key={exhibition._id}
                    exhibition={exhibition}
                    organizationId={organizationId}
                    canManage={canManage}
                    onUpdated={upsert}
                  />
                ))}
              </div>
            )}

          </section>

          <aside className="space-y-5">
            {canManage ? (
              <>
                <CreateExhibitionForm
                  organizationId={organizationId}
                  venues={venues}
                  onCreated={upsert}
                />
                <CreateVenueForm organizationId={organizationId} onCreated={() => void venueResource.reload()} />
              </>
            ) : (
              <Alert variant="info">
                <AlertTitle>Read-only access</AlertTitle>
                <AlertDescription>
                  Your role can view exhibitions but not create or publish them. Ask an organization owner or admin for
                  access.
                </AlertDescription>
              </Alert>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
