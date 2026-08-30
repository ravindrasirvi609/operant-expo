"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { formatArea, formatMetres } from "@/lib/floor-plans/units";
import { STALL_TYPES, STALL_TYPE_LABELS, VISIBILITIES } from "@/lib/validation/map";
import type { PlanElement, PlanStall, useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

/** Statuses an organizer may set. The rest are owned by the booking flow. */
const SETTABLE_STATUSES = ["AVAILABLE", "BLOCKED"] as const;

/**
 * Properties of the selected stall, edited in place beside the canvas.
 *
 * Stall number, type, price, amenities and visibility all live here, so placing and pricing a stall
 * is one continuous action rather than two screens with a dropdown between them. Dimensions are
 * shown read-only because they *are* the rectangle — dragging the resize handle is how they change.
 */
export function StallPanel({
  api,
  element,
  stall,
  onDeleted,
}: {
  api: PlanApi;
  element: PlanElement;
  stall: PlanStall | undefined;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = React.useState(() => ({
    stallNumber: stall?.stallNumber ?? element.label ?? "",
    section: stall?.section ?? "",
    stallType: stall?.stallType ?? "STANDARD",
    basePrice: stall ? String(stall.basePrice) : "",
    currency: stall?.currency ?? "INR",
    amenities: stall?.amenities.join(", ") ?? "",
    description: stall?.description ?? "",
    visibility: stall?.visibility ?? "PUBLIC",
    status: stall && SETTABLE_STATUSES.includes(stall.status as (typeof SETTABLE_STATUSES)[number]) ? stall.status : "AVAILABLE",
  }));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Re-seed when the selection changes; the panel is keyed by element id at the call site so this
  // only runs for a genuinely different stall.
  const set = <K extends keyof typeof draft,>(key: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const statusLocked = Boolean(stall) && !SETTABLE_STATUSES.includes(stall!.status as (typeof SETTABLE_STATUSES)[number]);

  async function save() {
    setBusy(true);
    setError("");

    const payload = {
      stallNumber: draft.stallNumber,
      section: draft.section || undefined,
      stallType: draft.stallType,
      basePrice: Number(draft.basePrice) || 0,
      currency: draft.currency,
      amenities: draft.amenities
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      description: draft.description || undefined,
      visibility: draft.visibility,
      ...(statusLocked ? {} : { status: draft.status }),
    };

    const result = stall
      ? await api.updateStall(stall._id, payload)
      : // An unlinked rectangle becomes bookable by being given a number and a price. This is the
        // path that turns the old editor's decorative rectangles into real inventory.
        await api.createStall({ ...payload, geometry: element.geometry, label: draft.stallNumber });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(stall ? `${draft.stallNumber} saved.` : `${draft.stallNumber} is now bookable.`);
  }

  async function remove() {
    if (!stall) return;
    setBusy(true);
    const result = await api.deleteStall(stall._id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`${stall.stallNumber} removed.`);
    onDeleted();
  }

  return (
    <div className="space-y-4">
      {!stall && (
        <Alert variant="warning">
          <AlertDescription>
            This rectangle is not bookable yet. Give it a number and a price to turn it into inventory.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-xs text-[var(--ink-soft)]">
          {formatMetres(element.geometry.width)} x {formatMetres(element.geometry.height)} ·{" "}
          {formatArea(element.geometry.width, element.geometry.height)}
        </p>
        {stall && <StatusBadge status={stall.status} />}
      </div>

      <FieldGroup columns={2}>
        <Field label="Stall number" required>
          <Input value={draft.stallNumber} onChange={(event) => set("stallNumber", event.target.value)} placeholder="A-12" />
        </Field>
        <Field label="Section">
          <Input value={draft.section} onChange={(event) => set("section", event.target.value)} placeholder="A" />
        </Field>
      </FieldGroup>

      <Field label="Stall type" htmlFor="panel-type">
        <Select value={draft.stallType} onValueChange={(value) => set("stallType", value)}>
          <SelectTrigger id="panel-type">
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
        <Field label="Base price" required>
          <Input value={draft.basePrice} onChange={(event) => set("basePrice", event.target.value)} type="number" min="0" placeholder="45000" />
        </Field>
        <Field label="Currency" required>
          <Input value={draft.currency} onChange={(event) => set("currency", event.target.value)} maxLength={3} />
        </Field>
      </FieldGroup>

      <Field label="Amenities" description="Comma separated.">
        <Input value={draft.amenities} onChange={(event) => set("amenities", event.target.value)} placeholder="Power, Wi-Fi" />
      </Field>

      <Field label="Description">
        <Textarea value={draft.description} onChange={(event) => set("description", event.target.value)} rows={2} />
      </Field>

      <FieldGroup columns={2}>
        <Field
          label="Status"
          htmlFor="panel-status"
          description={statusLocked ? `Set to ${stall!.status.toLowerCase()} by a live hold or booking.` : undefined}
        >
          <Select value={draft.status} onValueChange={(value) => set("status", value)} disabled={statusLocked}>
            <SelectTrigger id="panel-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTABLE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Visibility" htmlFor="panel-visibility">
          <Select value={draft.visibility} onValueChange={(value) => set("visibility", value)}>
            <SelectTrigger id="panel-visibility">
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
        <Button onClick={() => void save()} loading={busy} className="flex-1" disabled={!draft.stallNumber}>
          {stall ? "Save stall" : "Make bookable"}
        </Button>
        {stall && (
          <Button variant="destructive" size="icon" onClick={() => void remove()} disabled={busy} aria-label="Delete stall">
            <Trash2 aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
