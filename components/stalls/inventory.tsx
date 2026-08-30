"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Grid3x3, LayoutTemplate, Pencil } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { useOrganization } from "@/components/providers/organization-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/http/client";
import { applyApiErrors, useZodForm } from "@/lib/ui/forms";
import { useOrgResource } from "@/lib/ui/use-org-resource";
import {
  STALL_STATUSES,
  STALL_TYPES,
  STALL_TYPE_LABELS,
  VISIBILITIES,
  stallSchema,
} from "@/lib/validation/map";

type Exhibition = { _id: string; name: string; lifecycle: string };
type Hall = { _id: string; name: string; code: string };
type MapElement = { _id: string; label?: string };

type Stall = {
  _id: string;
  floorPlanElementId: string;
  stallNumber: string;
  section?: string;
  stallType: string;
  width: number;
  height: number;
  area: number;
  basePrice: number;
  currency: string;
  status: string;
  visibility: string;
  amenities: string[];
  description?: string;
};

/**
 * Amenities are stored as an array but typed as one comma-separated line, so the form carries a
 * text field and converts on submit. Everything else validates against the shared stall schema
 * the API uses, so a rule cannot differ between the two.
 */
const stallFormSchema = stallSchema.omit({ amenities: true }).extend({
  amenitiesText: z.string().max(400, "Keep the amenities list under 400 characters.").optional(),
});

function toAmenities(text?: string) {
  return (text ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const EMPTY_STALL = {
  floorPlanElementId: "",
  stallNumber: "",
  section: "",
  stallType: "STANDARD" as const,
  width: "" as unknown as number,
  height: "" as unknown as number,
  basePrice: "" as unknown as number,
  currency: "INR",
  description: "",
  amenitiesText: "",
  visibility: "PUBLIC" as const,
  status: "AVAILABLE" as const,
};

function StallForm({
  organizationId,
  exhibitionId,
  hallId,
  elements,
  stall,
  linkedElementIds,
  onSaved,
  onCancel,
}: {
  organizationId: string;
  exhibitionId: string;
  hallId: string;
  elements: MapElement[];
  stall?: Stall;
  linkedElementIds: Set<string>;
  onSaved: (stall: Stall, created: boolean) => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(stall);

  const form = useZodForm(
    stallFormSchema,
    stall
      ? {
          floorPlanElementId: stall.floorPlanElementId,
          stallNumber: stall.stallNumber,
          section: stall.section ?? "",
          stallType: stall.stallType as (typeof STALL_TYPES)[number],
          width: stall.width,
          height: stall.height,
          basePrice: stall.basePrice,
          currency: stall.currency,
          description: stall.description ?? "",
          amenitiesText: stall.amenities.join(", "),
          visibility: stall.visibility as (typeof VISIBILITIES)[number],
          status: stall.status as (typeof STALL_STATUSES)[number],
        }
      : EMPTY_STALL,
  );
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  // Only elements without a stall record are offered, so two inventory items can never claim the
  // same rectangle on the plan.
  const availableElements = elements.filter(
    (element) => !linkedElementIds.has(element._id) || element._id === stall?.floorPlanElementId,
  );

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    const { amenitiesText, ...rest } = values;
    const payload = { ...rest, amenities: toAmenities(amenitiesText) };

    const base = `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls/${hallId}/stalls`;
    const result = await apiRequest<{ stall: Stall }>(stall ? `${base}/${stall._id}` : base, {
      method: stall ? "PATCH" : "POST",
      json: payload,
    });

    if (!result.ok) {
      applyApiErrors(result, setError);
      return;
    }

    onSaved(result.data.stall, !stall);
    toast.success(
      stall
        ? `Stall ${result.data.stall.stallNumber} updated.`
        : `Stall ${result.data.stall.stallNumber} added to inventory.`,
    );
    if (!stall) reset(EMPTY_STALL);
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      {!editing && (
        <Field
          label="Floor-plan rectangle"
          error={errors.floorPlanElementId?.message}
          description="Which shape on the map this stall is. Draw shapes in the floor-plan editor first."
          htmlFor="stall-element"
          required
        >
          <Select
            value={watch("floorPlanElementId")}
            onValueChange={(value) => setValue("floorPlanElementId", value, { shouldDirty: true })}
          >
            <SelectTrigger id="stall-element">
              <SelectValue placeholder={availableElements.length ? "Select a rectangle" : "No unlinked rectangles"} />
            </SelectTrigger>
            <SelectContent>
              {availableElements.map((element) => (
                <SelectItem key={element._id} value={element._id}>
                  {element.label ?? "Unnamed stall"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <FieldGroup columns={2}>
        <Field label="Stall number" error={errors.stallNumber?.message} required>
          <Input {...register("stallNumber")} placeholder="A-12" />
        </Field>
        <Field label="Section" error={errors.section?.message}>
          <Input {...register("section")} placeholder="A" />
        </Field>
      </FieldGroup>

      <Field label="Stall type" error={errors.stallType?.message} htmlFor="stall-type" required>
        <Select
          value={watch("stallType")}
          onValueChange={(value) =>
            setValue("stallType", value as (typeof STALL_TYPES)[number], { shouldDirty: true })
          }
        >
          <SelectTrigger id="stall-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STALL_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {STALL_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <FieldGroup columns={2}>
        <Field label="Width (m)" error={errors.width?.message} required>
          <Input {...register("width")} type="number" min="0.5" step="0.5" inputMode="decimal" placeholder="3" />
        </Field>
        <Field label="Depth (m)" error={errors.height?.message} required>
          <Input {...register("height")} type="number" min="0.5" step="0.5" inputMode="decimal" placeholder="3" />
        </Field>
        <Field label="Base price" error={errors.basePrice?.message} required>
          <Input {...register("basePrice")} type="number" min="0" step="1" inputMode="decimal" placeholder="45000" />
        </Field>
        <Field label="Currency" error={errors.currency?.message} required>
          <Input {...register("currency")} maxLength={3} placeholder="INR" spellCheck={false} />
        </Field>
      </FieldGroup>

      <Field
        label="Amenities"
        error={errors.amenitiesText?.message}
        description="Comma separated, e.g. Power, Wi-Fi, Corner access."
      >
        <Input {...register("amenitiesText")} placeholder="Power, Wi-Fi" />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <Textarea {...register("description")} rows={2} placeholder="Shown to visitors before they book." />
      </Field>

      <FieldGroup columns={2}>
        <Field label="Status" error={errors.status?.message} htmlFor="stall-status">
          <Select
            value={watch("status") ?? "AVAILABLE"}
            onValueChange={(value) =>
              setValue("status", value as (typeof STALL_STATUSES)[number], { shouldDirty: true })
            }
          >
            <SelectTrigger id="stall-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STALL_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.replace(/_/g, " ").toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Visibility"
          error={errors.visibility?.message}
          htmlFor="stall-visibility"
          description="Private stalls never appear publicly."
        >
          <Select
            value={watch("visibility")}
            onValueChange={(value) =>
              setValue("visibility", value as (typeof VISIBILITIES)[number], { shouldDirty: true })
            }
          >
            <SelectTrigger id="stall-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITIES.map((visibility) => (
                <SelectItem key={visibility} value={visibility}>
                  {visibility.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <div className="flex gap-2">
        <Button
          type="submit"
          loading={isSubmitting}
          className="flex-1"
          disabled={!editing && availableElements.length === 0}
        >
          {editing ? "Save changes" : "Create stall"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export default function StallsInventory() {
  const { organizationId, loading: organizationsLoading, can } = useOrganization();

  // Only the user's explicit picks are stored; the effective selection falls back to the first
  // available option. Deriving it this way removes the three chained effects that each wrote
  // default state as soon as a list arrived.
  const [pickedExhibitionId, setPickedExhibitionId] = React.useState("");
  const [pickedHallId, setPickedHallId] = React.useState("");
  const [editing, setEditing] = React.useState<Stall | null>(null);
  const [createdOrUpdated, setCreatedOrUpdated] = React.useState<Stall[]>([]);

  const exhibitionResource = useOrgResource<{ exhibitions: Exhibition[] }>(
    organizationId ? `/api/organizations/${organizationId}/exhibitions` : null,
  );
  const exhibitions = exhibitionResource.data?.exhibitions ?? [];
  const exhibitionId =
    pickedExhibitionId && exhibitions.some((item) => item._id === pickedExhibitionId)
      ? pickedExhibitionId
      : (exhibitions[0]?._id ?? "");

  const hallResource = useOrgResource<{ halls: Hall[] }>(
    organizationId && exhibitionId
      ? `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls`
      : null,
  );
  const halls = hallResource.data?.halls ?? [];
  const hallId =
    pickedHallId && halls.some((item) => item._id === pickedHallId) ? pickedHallId : (halls[0]?._id ?? "");

  const hallBase =
    organizationId && exhibitionId && hallId
      ? `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls/${hallId}`
      : null;

  const stallResource = useOrgResource<{ stalls: Stall[] }>(hallBase ? `${hallBase}/stalls` : null);
  const elementResource = useOrgResource<{ elements: MapElement[] }>(
    hallBase ? `${hallBase}/map-elements` : null,
  );

  const elements = elementResource.data?.elements ?? [];
  const loading =
    exhibitionResource.loading || hallResource.loading || stallResource.loading || elementResource.loading;
  const error =
    exhibitionResource.error || hallResource.error || stallResource.error || elementResource.error;

  // Server list merged with anything saved in this session, so a new stall appears immediately.
  const stalls = React.useMemo(() => {
    const loaded = stallResource.data?.stalls ?? [];
    const byId = new Map(loaded.map((stall) => [stall._id, stall]));
    for (const stall of createdOrUpdated) byId.set(stall._id, stall);
    return Array.from(byId.values()).sort((a, b) => a.stallNumber.localeCompare(b.stallNumber));
  }, [stallResource.data, createdOrUpdated]);

  const canManage = can("exhibition:manage");

  const linkedElementIds = React.useMemo(
    () => new Set(stalls.map((stall) => stall.floorPlanElementId)),
    [stalls],
  );
  const unlinkedCount = elements.length - linkedElementIds.size;
  const selectedExhibition = exhibitions.find((exhibition) => exhibition._id === exhibitionId);

  function upsertStall(stall: Stall, created: boolean) {
    setCreatedOrUpdated((current) => [...current.filter((item) => item._id !== stall._id), stall]);
    if (!created) setEditing(null);
  }

  const planHref =
    exhibitionId && hallId
      ? `/dashboard/exhibitions/${exhibitionId}/halls/${hallId}/map/edit?organizationId=${organizationId}`
      : "";

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-8 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <SectionEyebrow>Inventory</SectionEyebrow>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            Stalls
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">
            Pricing, visibility and live availability for every bookable stall. A stall must be linked to a rectangle
            on its hall floor plan before visitors can book it.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={exhibitionId} onValueChange={setPickedExhibitionId}>
            <SelectTrigger size="sm" aria-label="Exhibition">
              <SelectValue placeholder="Exhibition" />
            </SelectTrigger>
            <SelectContent>
              {exhibitions.map((exhibition) => (
                <SelectItem key={exhibition._id} value={exhibition._id}>
                  {exhibition.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={hallId} onValueChange={setPickedHallId}>
            <SelectTrigger size="sm" aria-label="Hall">
              <SelectValue placeholder="Hall" />
            </SelectTrigger>
            <SelectContent>
              {halls.map((hall) => (
                <SelectItem key={hall._id} value={hall._id}>
                  {hall.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
          description="Create an organization, an exhibition and a hall before adding stalls."
          action={
            <Button asChild>
              <Link href="/dashboard/organizations/new">Create organization</Link>
            </Button>
          }
        />
      ) : exhibitions.length === 0 && !loading ? (
        <EmptyState
          className="mt-8"
          icon={Grid3x3}
          title="No exhibitions yet"
          description="Stalls belong to a hall inside an exhibition. Create an exhibition first."
          action={
            <Button asChild>
              <Link href="/dashboard/exhibitions">Go to exhibitions</Link>
            </Button>
          }
        />
      ) : halls.length === 0 && !loading ? (
        <EmptyState
          className="mt-8"
          icon={Grid3x3}
          title="This exhibition has no halls"
          description="Add a hall to it, then design the hall floor plan to place stalls."
          action={
            <Button asChild>
              <Link href="/dashboard/exhibitions">Add a hall</Link>
            </Button>
          }
        />
      ) : (
        <>
          {!loading && elements.length === 0 && (
            <Alert variant="warning" className="mt-6">
              <AlertTitle>This hall has no floor-plan rectangles yet</AlertTitle>
              <AlertDescription>
                A stall is an inventory record attached to a shape on the floor plan. Draw the stalls on the plan
                first, then price them here.
                {planHref && (
                  <span className="mt-3 block">
                    <Button asChild size="sm">
                      <Link href={planHref}>
                        <LayoutTemplate aria-hidden />
                        Open floor-plan editor
                      </Link>
                    </Button>
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {!loading && elements.length > 0 && unlinkedCount > 0 && (
            <Alert variant="warning" className="mt-6">
              <AlertTitle>
                {unlinkedCount} {unlinkedCount === 1 ? "rectangle is" : "rectangles are"} not bookable
              </AlertTitle>
              <AlertDescription>
                They exist on the floor plan but have no price or stall number, so visitors cannot book them. Add them
                as stalls using the panel on the right.
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_380px]">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-[var(--line)]">
                <CardTitle>Stall inventory</CardTitle>
                <CardDescription>
                  {stalls.length} configured · {stalls.filter((stall) => stall.status === "AVAILABLE").length} available
                  {selectedExhibition ? ` · ${selectedExhibition.name}` : ""}
                </CardDescription>
              </CardHeader>

              {loading ? (
                <div className="space-y-3 p-6">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10" />
                  ))}
                </div>
              ) : stalls.length === 0 ? (
                <EmptyState
                  className="border-0"
                  icon={Grid3x3}
                  title="No stalls configured for this hall"
                  description="Once you add one, it becomes bookable on the published floor plan."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stall</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stalls.map((stall) => (
                      <TableRow key={stall._id}>
                        <TableCell className="font-mono font-medium text-[var(--ink)]">
                          {stall.stallNumber}
                          {stall.section && <span className="ml-2 text-[var(--ink-faint)]">{stall.section}</span>}
                          {stall.visibility === "PRIVATE" && (
                            <span className="ml-2 text-xs font-normal text-[var(--ink-faint)]">private</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[var(--ink-soft)]">
                          {STALL_TYPE_LABELS[stall.stallType as (typeof STALL_TYPES)[number]] ?? stall.stallType}
                        </TableCell>
                        <TableCell className="font-mono tabular">{stall.area} m²</TableCell>
                        <TableCell className="font-mono tabular">
                          {stall.basePrice.toLocaleString()} {stall.currency}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={stall.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {canManage && (
                            <Button size="sm" variant="outline" onClick={() => setEditing(stall)}>
                              <Pencil aria-hidden />
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <aside>
              {canManage ? (
                <Card className="corner-marks h-fit p-6">
                  <h2 className="font-display font-semibold text-[var(--ink)]">Add bookable stall</h2>
                  <p className="mb-4 mt-1 text-sm text-[var(--ink-soft)]">
                    Link a floor-plan rectangle to a priced inventory item.
                  </p>
                  {hallId && (
                    <StallForm
                      organizationId={organizationId}
                      exhibitionId={exhibitionId}
                      hallId={hallId}
                      elements={elements}
                      linkedElementIds={linkedElementIds}
                      onSaved={upsertStall}
                    />
                  )}
                </Card>
              ) : (
                <Alert variant="info">
                  <AlertTitle>Read-only access</AlertTitle>
                  <AlertDescription>Your role can view stalls but not change pricing or availability.</AlertDescription>
                </Alert>
              )}
            </aside>
          </div>
        </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit stall {editing?.stallNumber}</DialogTitle>
            <DialogDescription>Update pricing, visibility or booking status.</DialogDescription>
          </DialogHeader>
          {editing && (
            <StallForm
              organizationId={organizationId}
              exhibitionId={exhibitionId}
              hallId={hallId}
              elements={elements}
              stall={editing}
              linkedElementIds={linkedElementIds}
              onSaved={upsertStall}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
