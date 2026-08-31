"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, CalendarRange, Warehouse } from "lucide-react";

import { useOrganization } from "@/components/providers/organization-provider";
import { InventoryTable } from "@/components/stalls/inventory-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFloorPlan } from "@/lib/ui/use-floor-plan";
import { useOrgResource } from "@/lib/ui/use-org-resource";

type Exhibition = { _id: string; name: string; lifecycle: string };
type Hall = { _id: string; name: string; code: string };

/**
 * Pricing and availability across an organization's halls.
 *
 * The stalls arrive with the hall's floor plan, in the same single read the wizard uses, so this
 * screen cannot show a different set of stalls from the plan they live on.
 *
 * Creating a stall is deliberately not possible here. The old screen offered a form that picked a
 * rectangle from a dropdown and took its own width and height, which let a stall claim a footprint
 * its rectangle did not have — and once placing a stall began creating both records together, there
 * was no unlinked rectangle left for that dropdown to offer.
 */
export default function StallsInventory() {
  const { organizationId, loading: organizationsLoading, can } = useOrganization();

  // Only explicit picks are stored; the effective selection falls back to the first option, so no
  // effect has to write default state as soon as a list arrives.
  const [pickedExhibitionId, setPickedExhibitionId] = React.useState("");
  const [pickedHallId, setPickedHallId] = React.useState("");

  const exhibitionResource = useOrgResource<{ exhibitions: Exhibition[] }>(
    organizationId ? `/api/organizations/${organizationId}/exhibitions` : null,
  );
  const exhibitions = exhibitionResource.data?.exhibitions ?? [];
  const exhibitionId =
    pickedExhibitionId && exhibitions.some((item) => item._id === pickedExhibitionId)
      ? pickedExhibitionId
      : (exhibitions[0]?._id ?? "");
  const exhibition = exhibitions.find((item) => item._id === exhibitionId) ?? null;

  const hallResource = useOrgResource<{ halls: Hall[] }>(
    organizationId && exhibitionId
      ? `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls`
      : null,
  );
  const halls = hallResource.data?.halls ?? [];
  const hallId =
    pickedHallId && halls.some((item) => item._id === pickedHallId) ? pickedHallId : (halls[0]?._id ?? "");

  const plan = useFloorPlan({ organizationId, exhibitionId, hallId });
  const canManage = can("exhibition:manage");
  const planHref =
    exhibitionId && hallId ? `/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/plan` : undefined;

  const loading = exhibitionResource.loading || hallResource.loading || (Boolean(hallId) && plan.loading);
  const error = exhibitionResource.error || hallResource.error || plan.loadError;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-8 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <SectionEyebrow>Inventory</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            Stalls
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">
            Pricing, visibility and live availability for every stall. Placement and sizing happen on the floor plan.
          </p>
        </div>

        {exhibitions.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={exhibitionId} onValueChange={setPickedExhibitionId}>
              <SelectTrigger size="sm" aria-label="Exhibition">
                <SelectValue placeholder="Exhibition" />
              </SelectTrigger>
              <SelectContent>
                {exhibitions.map((item) => (
                  <SelectItem key={item._id} value={item._id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={hallId} onValueChange={setPickedHallId} disabled={halls.length === 0}>
              <SelectTrigger size="sm" aria-label="Hall">
                <SelectValue placeholder={halls.length ? "Hall" : "No halls"} />
              </SelectTrigger>
              <SelectContent>
                {halls.map((item) => (
                  <SelectItem key={item._id} value={item._id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t load inventory</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!organizationId && !organizationsLoading ? (
        <EmptyState
          className="mt-8"
          icon={Building2}
          title="No organization yet"
          description="Create an organization, an exhibition and a hall before pricing stalls."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : exhibitions.length === 0 && !exhibitionResource.loading ? (
        <EmptyState
          className="mt-8"
          icon={CalendarRange}
          title="No exhibitions yet"
          description="Stalls belong to a hall inside an exhibition."
          action={
            <Button asChild>
              <Link href="/dashboard/exhibitions">Create an exhibition</Link>
            </Button>
          }
        />
      ) : halls.length === 0 && !hallResource.loading ? (
        <EmptyState
          className="mt-8"
          icon={Warehouse}
          title="This exhibition has no halls"
          description="Add a hall, then design its floor plan to place and price stalls."
          action={
            <Button asChild>
              <Link href={`/dashboard/exhibitions/${exhibitionId}`}>Add a hall</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-8 space-y-4">
          {exhibition && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-soft)]">
              <StatusBadge status={exhibition.lifecycle} />
              {plan.plan && <StatusBadge status={plan.plan.status} />}
              {plan.plan?.status !== "PUBLISHED" && plan.stalls.length > 0 && (
                <span>These stalls are not visible to visitors until the floor plan is published.</span>
              )}
            </div>
          )}

          <InventoryTable
            organizationId={organizationId}
            floorPlanId={plan.plan?._id ?? null}
            stalls={plan.stalls}
            loading={loading}
            planHref={planHref}
            canManage={canManage}
            onChanged={async () => {
              await plan.reload();
            }}
            title={halls.find((hall) => hall._id === hallId)?.name ?? "Stall inventory"}
          />

          {!canManage && (
            <Alert variant="info">
              <AlertTitle>Read-only access</AlertTitle>
              <AlertDescription>Your role can view stalls but not change pricing or visibility.</AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </main>
  );
}
