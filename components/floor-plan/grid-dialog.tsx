"use client";

import * as React from "react";
import { Grid3x3 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { gridFootprint, stallNumberAt, type NumberingScheme } from "@/lib/floor-plans/geometry";
import { formatMetres, metresToUnits } from "@/lib/floor-plans/units";
import { STALL_TYPES, STALL_TYPE_LABELS } from "@/lib/validation/map";
import type { useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

/** Everything the dialog collects, in the units a person thinks in (metres). */
type Draft = {
  rows: string;
  columns: string;
  stallWidth: string;
  stallDepth: string;
  aisleX: string;
  aisleY: string;
  originX: string;
  originY: string;
  scheme: NumberingScheme;
  prefix: string;
  start: string;
  stallType: string;
  basePrice: string;
  currency: string;
};

const INITIAL: Draft = {
  rows: "3",
  columns: "6",
  stallWidth: "3",
  stallDepth: "3",
  aisleX: "0",
  aisleY: "2",
  originX: "1",
  originY: "1",
  scheme: "ROW_LETTER",
  prefix: "",
  start: "1",
  stallType: "STANDARD",
  basePrice: "",
  currency: "INR",
};

/**
 * Generates a block of numbered, priced stalls in one action.
 *
 * This is the difference between laying out a hall in a minute and doing it one rectangle at a
 * time, then pricing each of them on a different screen. Inputs are in metres; the server receives
 * plan units.
 */
export function GridDialog({ api }: { api: PlanApi }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(INITIAL);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const set = <K extends keyof Draft,>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const numeric = {
    rows: Math.max(0, Math.floor(Number(draft.rows) || 0)),
    columns: Math.max(0, Math.floor(Number(draft.columns) || 0)),
    stallWidth: metresToUnits(Number(draft.stallWidth) || 0),
    stallHeight: metresToUnits(Number(draft.stallDepth) || 0),
    gapX: metresToUnits(Number(draft.aisleX) || 0),
    gapY: metresToUnits(Number(draft.aisleY) || 0),
    originX: metresToUnits(Number(draft.originX) || 0),
    originY: metresToUnits(Number(draft.originY) || 0),
  };

  const total = numeric.rows * numeric.columns;
  const footprint = gridFootprint({ ...numeric, scheme: draft.scheme, start: 1 });
  const needsWidth = numeric.originX + footprint.width;
  const needsHeight = numeric.originY + footprint.height;
  const canvasWidth = api.plan?.canvasWidth ?? 0;
  const canvasHeight = api.plan?.canvasHeight ?? 0;
  const overflows = needsWidth > canvasWidth || needsHeight > canvasHeight;

  const firstNumber = stallNumberAt(0, 0, numeric.columns || 1, {
    scheme: draft.scheme,
    prefix: draft.prefix,
    start: Math.max(1, Number(draft.start) || 1),
  });
  const lastNumber =
    total > 0
      ? stallNumberAt(numeric.rows - 1, numeric.columns - 1, numeric.columns, {
          scheme: draft.scheme,
          prefix: draft.prefix,
          start: Math.max(1, Number(draft.start) || 1),
        })
      : "—";

  async function generate() {
    setBusy(true);
    setError("");

    const result = await api.createGrid({
      ...numeric,
      scheme: draft.scheme,
      prefix: draft.prefix || undefined,
      start: Math.max(1, Number(draft.start) || 1),
      stallType: draft.stallType,
      basePrice: Number(draft.basePrice) || 0,
      currency: draft.currency,
      amenities: [],
      visibility: "PUBLIC",
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(`${total} stalls added.`, { description: `Numbered ${firstNumber} to ${lastNumber}.` });
    setOpen(false);
    setDraft(INITIAL);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!api.plan}>
          <Grid3x3 aria-hidden />
          Add a grid of stalls
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a grid of stalls</DialogTitle>
          <DialogDescription>
            Every stall is created priced and bookable. Sizes are in metres.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-5">
          <FieldSet legend="Layout">
            <FieldGroup columns={2}>
              <Field label="Rows" htmlFor="grid-rows" required>
                <Input id="grid-rows" value={draft.rows} onChange={(e) => set("rows", e.target.value)} type="number" min="1" max="60" />
              </Field>
              <Field label="Stalls per row" htmlFor="grid-columns" required>
                <Input id="grid-columns" value={draft.columns} onChange={(e) => set("columns", e.target.value)} type="number" min="1" max="60" />
              </Field>
              <Field label="Stall width (m)" htmlFor="grid-width" required>
                <Input id="grid-width" value={draft.stallWidth} onChange={(e) => set("stallWidth", e.target.value)} type="number" min="0.5" step="0.5" />
              </Field>
              <Field label="Stall depth (m)" htmlFor="grid-depth" required>
                <Input id="grid-depth" value={draft.stallDepth} onChange={(e) => set("stallDepth", e.target.value)} type="number" min="0.5" step="0.5" />
              </Field>
              <Field label="Gap between stalls (m)" htmlFor="grid-aisle-x" description="0 places them flush.">
                <Input id="grid-aisle-x" value={draft.aisleX} onChange={(e) => set("aisleX", e.target.value)} type="number" min="0" step="0.5" />
              </Field>
              <Field label="Aisle between rows (m)" htmlFor="grid-aisle-y">
                <Input id="grid-aisle-y" value={draft.aisleY} onChange={(e) => set("aisleY", e.target.value)} type="number" min="0" step="0.5" />
              </Field>
              <Field label="Offset from left (m)" htmlFor="grid-origin-x">
                <Input id="grid-origin-x" value={draft.originX} onChange={(e) => set("originX", e.target.value)} type="number" min="0" step="0.5" />
              </Field>
              <Field label="Offset from top (m)" htmlFor="grid-origin-y">
                <Input id="grid-origin-y" value={draft.originY} onChange={(e) => set("originY", e.target.value)} type="number" min="0" step="0.5" />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet legend="Numbering">
            <FieldGroup columns={3}>
              <Field label="Scheme" htmlFor="grid-scheme">
                <Select value={draft.scheme} onValueChange={(value) => set("scheme", value as NumberingScheme)}>
                  <SelectTrigger id="grid-scheme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROW_LETTER">Row letter (A-1, A-2, B-1)</SelectItem>
                    <SelectItem value="SEQUENTIAL">Sequential (1, 2, 3)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prefix" htmlFor="grid-prefix" description="Optional, e.g. H1-">
                <Input id="grid-prefix" value={draft.prefix} onChange={(e) => set("prefix", e.target.value)} maxLength={12} />
              </Field>
              <Field label="Start at" htmlFor="grid-start">
                <Input id="grid-start" value={draft.start} onChange={(e) => set("start", e.target.value)} type="number" min="1" />
              </Field>
            </FieldGroup>
          </FieldSet>

          <FieldSet legend="Pricing" description="Applies to every stall in the grid. Adjust individually afterwards.">
            <FieldGroup columns={3}>
              <Field label="Stall type" htmlFor="grid-type">
                <Select value={draft.stallType} onValueChange={(value) => set("stallType", value)}>
                  <SelectTrigger id="grid-type">
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
              <Field label="Base price" htmlFor="grid-price" required>
                <Input id="grid-price" value={draft.basePrice} onChange={(e) => set("basePrice", e.target.value)} type="number" min="0" placeholder="45000" />
              </Field>
              <Field label="Currency" htmlFor="grid-currency" required>
                <Input id="grid-currency" value={draft.currency} onChange={(e) => set("currency", e.target.value)} maxLength={3} />
              </Field>
            </FieldGroup>
          </FieldSet>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--paper-sunken)] p-4 text-sm">
            <p className="font-medium text-[var(--ink)]">
              {total} stall{total === 1 ? "" : "s"}, numbered {firstNumber} to {lastNumber}
            </p>
            <p className="mt-1 font-mono text-xs text-[var(--ink-soft)]">
              Occupies {formatMetres(needsWidth)} x {formatMetres(needsHeight)} of a{" "}
              {formatMetres(canvasWidth)} x {formatMetres(canvasHeight)} canvas
            </p>
            {overflows && (
              <p className="mt-2 text-xs font-medium text-[var(--status-booked-ink)]">
                That does not fit. Reduce the rows, stalls per row or aisles, or enlarge the canvas on the canvas step.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void generate()} loading={busy} disabled={total === 0 || overflows || !draft.basePrice}>
            Add {total || ""} stall{total === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
