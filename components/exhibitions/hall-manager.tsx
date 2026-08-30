"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutTemplate, Map, Warehouse } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { useOrgResource } from "@/lib/ui/use-org-resource";
import { hallSchema } from "@/lib/validation/exhibition";

export type Hall = {
  _id: string;
  name: string;
  code: string;
  width: number;
  height: number;
  level?: string;
};

export function HallManager({
  organizationId,
  exhibitionId,
  exhibitionName,
}: {
  organizationId: string;
  exhibitionId: string;
  exhibitionName: string;
}) {
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useOrgResource<{ halls: Hall[] }>(
    `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls`,
  );
  const halls = data?.halls ?? [];

  const form = useZodForm(hallSchema, {
    name: "",
    code: "",
    width: "" as unknown as number,
    height: "" as unknown as number,
    level: "",
    publicVisibility: true,
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const result = await apiRequest<{ hall: Hall }>(
      `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls`,
      { method: "POST", json: values },
    );

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    // Re-read rather than appending locally, so the list always matches what the server has.
    await reload();
    toast.success(`Hall ${result.data.hall.name} added.`, {
      description: "Design its floor plan to place and price stalls.",
    });
    reset();
  });

  // These three routes are replaced by a single wizard at .../halls/[hallId]/plan in the next
  // phase; until then the editor is linked here so it is reachable at all — nothing in the UI
  // pointed at it before.
  const planHref = (hallId: string) =>
    `/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/map/edit?organizationId=${organizationId}`;
  const viewHref = (hallId: string) =>
    `/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/map?organizationId=${organizationId}`;
  const backgroundHref = (hallId: string) =>
    `/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/map/setup?organizationId=${organizationId}`;

  return (
    <Card className="corner-marks mt-8">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--brand-quiet)]">Hall setup</p>
            <CardTitle className="mt-1">{exhibitionName}</CardTitle>
            <CardDescription>
              A hall is one physical space. Each hall gets its own floor plan and its own stalls.
            </CardDescription>
          </div>
          <span className="rounded-full border border-[var(--line-strong)] px-3 py-1 font-mono text-xs text-[var(--ink-soft)]">
            {halls.length} {halls.length === 1 ? "hall" : "halls"}
          </span>
        </div>
      </CardHeader>

      <div className="px-6 pb-6">
        {loadError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-20" />
            ))}
          </div>
        ) : halls.length === 0 ? (
          <EmptyState
            icon={Warehouse}
            title="No halls yet"
            description="Add the first hall below. You need at least one active hall before this exhibition can be published."
          />
        ) : (
          <ul className="space-y-3">
            {halls.map((hall) => (
              <li
                key={hall._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[var(--ink)]">
                    {hall.name}
                    <span className="ml-2 font-mono text-xs text-[var(--ink-faint)]">{hall.code}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--ink-soft)]">
                    {hall.width} × {hall.height} m{hall.level ? ` · level ${hall.level}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href={planHref(hall._id)}>
                      <LayoutTemplate aria-hidden />
                      Design floor plan
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={viewHref(hall._id)}>
                      <Map aria-hidden />
                      View map
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={backgroundHref(hall._id)}>Background</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <DimensionDivider className="mt-6" />

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <FieldGroup columns={2}>
            <Field label="Hall name" error={errors.name?.message} required>
              <Input {...register("name")} placeholder="Hall A" />
            </Field>
            <Field
              label="Hall code"
              error={errors.code?.message}
              description="Short identifier, unique per exhibition."
              required
            >
              <Input {...register("code")} placeholder="HALL-A" spellCheck={false} />
            </Field>
            <Field
              label="Width (m)"
              error={errors.width?.message}
              description="Used to size the floor-plan canvas."
              required
            >
              <Input {...register("width")} type="number" min="1" step="0.5" inputMode="decimal" placeholder="40" />
            </Field>
            <Field label="Depth (m)" error={errors.height?.message} required>
              <Input {...register("height")} type="number" min="1" step="0.5" inputMode="decimal" placeholder="25" />
            </Field>
          </FieldGroup>

          <Button type="submit" variant="ink" loading={isSubmitting}>
            {isSubmitting ? "Adding hall…" : "Add hall"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
