"use client";

import * as React from "react";

import { PlanWizard } from "@/components/floor-plan/plan-wizard";
import { useOrganization } from "@/components/providers/organization-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function FloorPlanPage({
  params,
}: {
  params: Promise<{ exhibitionId: string; hallId: string }>;
}) {
  const { organizationId, loading, can } = useOrganization();
  const [ids, setIds] = React.useState<{ exhibitionId: string; hallId: string } | null>(null);

  React.useEffect(() => {
    void params.then(setIds);
  }, [params]);

  if (loading || !ids) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-8 h-[60vh]" />
      </main>
    );
  }

  // The organization comes from the shared provider, not a query parameter. The previous
  // floor-plan screens read ?organizationId= and nothing in the UI ever supplied it, so their
  // submit buttons sat permanently disabled.
  if (!organizationId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert variant="destructive">
          <AlertTitle>No organization selected</AlertTitle>
          <AlertDescription>
            Pick an organization from the header, or create one first.
            <span className="mt-3 block">
              <Button asChild size="sm">
                <Link href="/dashboard/organizations/new">Create organization</Link>
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!can("map:edit")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert variant="info">
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Your role cannot edit floor plans. Ask an organization owner or admin for map access.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <PlanWizard
      organizationId={organizationId}
      exhibitionId={ids.exhibitionId}
      hallId={ids.hallId}
    />
  );
}
