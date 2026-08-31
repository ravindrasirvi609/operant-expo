"use client";

import * as React from "react";
import Link from "next/link";

import { ExhibitionDetail } from "@/components/exhibitions/exhibition-detail";
import { useOrganization } from "@/components/providers/organization-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ExhibitionDetailPage({
  params,
}: {
  params: Promise<{ exhibitionId: string }>;
}) {
  const { organizationId, loading, can } = useOrganization();
  const [exhibitionId, setExhibitionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void params.then(({ exhibitionId: id }) => setExhibitionId(id));
  }, [params]);

  if (loading || !exhibitionId) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="mt-8 h-64" />
      </main>
    );
  }

  if (!organizationId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert variant="destructive">
          <AlertTitle>No organization selected</AlertTitle>
          <AlertDescription>
            Pick one from the header, or create your first workspace.
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

  return (
    <ExhibitionDetail
      organizationId={organizationId}
      exhibitionId={exhibitionId}
      canManage={can("exhibition:manage")}
    />
  );
}
