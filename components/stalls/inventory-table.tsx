"use client";

import * as React from "react";
import Link from "next/link";
import { Grid3x3, LayoutTemplate, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "@/lib/http/client";
import type { PlanStall } from "@/lib/ui/use-floor-plan";
import { STALL_TYPES, STALL_TYPE_LABELS, VISIBILITIES } from "@/lib/validation/map";

/** Statuses the booking flow owns; an organizer cannot set these from a table. */
const BOOKING_OWNED = new Set(["HELD", "PENDING", "BOOKED"]);

export type InventoryTableProps = {
  organizationId: string;
  /** Null while no plan exists for the selected hall, so editing is impossible. */
  floorPlanId: string | null;
  stalls: PlanStall[];
  loading?: boolean;
  /** Where "add stalls" should take the organizer. */
  planHref?: string;
  /** Re-read after a write, so the table reflects what the server has. */
  onChanged: () => void | Promise<void>;
  canManage: boolean;
  title?: string;
};

/**
 * The stall inventory surface: read, reprice one, reprice many.
 *
 * Shared by the wizard's pricing step, the standalone stalls screen and the exhibition detail tab,
 * so the three cannot drift. It deliberately cannot *create* a stall — a stall is a rectangle on a
 * plan plus its commercial record, and those are made together in the layout step. The old screen
 * offered a create form that took a rectangle from a dropdown and its own width and height, which
 * let a stall claim a footprint its rectangle did not have.
 */
export function InventoryTable({
  organizationId,
  floorPlanId,
  stalls,
  loading = false,
  planHref,
  onChanged,
  canManage,
  title = "Stall inventory",
}: InventoryTableProps) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = React.useState("");
  const [bulkType, setBulkType] = React.useState("");
  const [bulkVisibility, setBulkVisibility] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editPrice, setEditPrice] = React.useState("");

  const unpriced = stalls.filter((stall) => stall.basePrice <= 0);
  const currency = stalls[0]?.currency ?? "";
  const total = stalls.reduce((sum, stall) => sum + stall.basePrice, 0);
  const hasBulkChange = bulkPrice !== "" || bulkType !== "" || bulkVisibility !== "";

  function toggle(stallId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(stallId)) next.delete(stallId);
      else next.add(stallId);
      return next;
    });
  }

  function clearBulk() {
    setSelected(new Set());
    setBulkPrice("");
    setBulkType("");
    setBulkVisibility("");
  }

  async function applyBulk() {
    if (!floorPlanId) return;
    setBusy(true);

    const result = await apiRequest<{ updated: number; skipped: string[] }>(
      `/api/organizations/${organizationId}/floor-plans/${floorPlanId}/stalls/bulk-update`,
      {
        method: "PATCH",
        json: {
          stallIds: Array.from(selected),
          ...(bulkPrice !== "" ? { basePrice: Number(bulkPrice) } : {}),
          ...(bulkType !== "" ? { stallType: bulkType } : {}),
          ...(bulkVisibility !== "" ? { visibility: bulkVisibility } : {}),
        },
      },
    );

    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(`${result.data.updated} stall${result.data.updated === 1 ? "" : "s"} updated.`, {
      description: result.data.skipped.length > 0 ? `${result.data.skipped.length} skipped.` : undefined,
    });
    clearBulk();
    await onChanged();
  }

  async function saveOne(stall: PlanStall) {
    if (!floorPlanId) return;
    setBusy(true);
    const result = await apiRequest(
      `/api/organizations/${organizationId}/floor-plans/${floorPlanId}/stalls/${stall._id}`,
      { method: "PATCH", json: { basePrice: Number(editPrice) } },
    );
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${stall.stallNumber} repriced.`);
    setEditing(null);
    await onChanged();
  }

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      </Card>
    );
  }

  if (stalls.length === 0) {
    return (
      <EmptyState
        icon={Grid3x3}
        title="No stalls in this hall yet"
        description="Stalls are placed on the floor plan, which is also where they get their price. The grid generator creates a whole block at once."
        action={
          planHref && canManage ? (
            <Button asChild>
              <Link href={planHref}>
                <LayoutTemplate aria-hidden />
                Open the floor-plan wizard
              </Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {unpriced.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {unpriced.length} stall{unpriced.length === 1 ? "" : "s"} cost nothing
          </AlertTitle>
          <AlertDescription>
            {unpriced
              .slice(0, 8)
              .map((stall) => stall.stallNumber)
              .join(", ")}
            {unpriced.length > 8 ? ` and ${unpriced.length - 8} more` : ""}. A plan cannot be published until every
            stall has a price.
            {canManage && (
              <span className="mt-2 block">
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set(unpriced.map((s) => s._id)))}>
                  Select them
                </Button>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[var(--line)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>
                {stalls.length} stall{stalls.length === 1 ? "" : "s"} · {total.toLocaleString()} {currency} total ·{" "}
                {stalls.filter((stall) => stall.visibility === "PUBLIC").length} public
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected.size > 0 && (
                <span className="rounded-full border border-[var(--brand)] px-3 py-1 font-mono text-xs text-[var(--brand-quiet)]">
                  {selected.size} selected
                </span>
              )}
              {planHref && canManage && (
                <Button asChild size="sm" variant="outline">
                  <Link href={planHref}>
                    <LayoutTemplate aria-hidden />
                    Add or move stalls
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {selected.size > 0 && canManage && (
          <div className="border-b border-[var(--line)] bg-[var(--paper-sunken)] p-4">
            <FieldGroup columns={3}>
              <Field label="Set price" htmlFor="bulk-price">
                <Input
                  id="bulk-price"
                  value={bulkPrice}
                  onChange={(event) => setBulkPrice(event.target.value)}
                  type="number"
                  min="0"
                  placeholder="Leave blank to keep"
                />
              </Field>
              <Field label="Set type" htmlFor="bulk-type">
                <Select value={bulkType || "keep"} onValueChange={(value) => setBulkType(value === "keep" ? "" : value)}>
                  <SelectTrigger id="bulk-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep as is</SelectItem>
                    {STALL_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {STALL_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Set visibility" htmlFor="bulk-visibility">
                <Select
                  value={bulkVisibility || "keep"}
                  onValueChange={(value) => setBulkVisibility(value === "keep" ? "" : value)}
                >
                  <SelectTrigger id="bulk-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep as is</SelectItem>
                    {VISIBILITIES.map((visibility) => (
                      <SelectItem key={visibility} value={visibility}>
                        {visibility.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void applyBulk()} loading={busy} disabled={!hasBulkChange}>
                Apply to {selected.size} stall{selected.size === 1 ? "" : "s"}
              </Button>
              <Button size="sm" variant="ghost" onClick={clearBulk}>
                Clear selection
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              {canManage && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === stalls.length && stalls.length > 0}
                    onCheckedChange={() =>
                      setSelected((current) =>
                        current.size === stalls.length ? new Set() : new Set(stalls.map((stall) => stall._id)),
                      )
                    }
                    aria-label="Select all stalls"
                  />
                </TableHead>
              )}
              <TableHead>Stall</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visibility</TableHead>
              {canManage && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stalls.map((stall) => (
              <TableRow key={stall._id} data-state={selected.has(stall._id) ? "selected" : undefined}>
                {canManage && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(stall._id)}
                      onCheckedChange={() => toggle(stall._id)}
                      aria-label={`Select ${stall.stallNumber}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono font-medium text-[var(--ink)]">
                  {stall.stallNumber}
                  {stall.section && <span className="ml-2 text-[var(--ink-faint)]">{stall.section}</span>}
                </TableCell>
                <TableCell className="text-[var(--ink-soft)]">
                  {STALL_TYPE_LABELS[stall.stallType as (typeof STALL_TYPES)[number]] ?? stall.stallType}
                </TableCell>
                <TableCell className="font-mono tabular whitespace-nowrap">
                  {stall.width} × {stall.height} m
                </TableCell>
                <TableCell className="font-mono tabular">
                  {editing === stall._id ? (
                    <span className="flex items-center gap-2">
                      <Input
                        value={editPrice}
                        onChange={(event) => setEditPrice(event.target.value)}
                        type="number"
                        min="0"
                        className="h-8 w-28"
                        aria-label={`Price for ${stall.stallNumber}`}
                      />
                      <Button size="sm" onClick={() => void saveOne(stall)} loading={busy}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span style={stall.basePrice <= 0 ? { color: "var(--status-booked-ink)" } : undefined}>
                      {stall.basePrice > 0 ? `${stall.basePrice.toLocaleString()} ${stall.currency}` : "not set"}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={stall.status} />
                </TableCell>
                <TableCell className="text-[var(--ink-soft)]">{stall.visibility.toLowerCase()}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {editing !== stall._id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!floorPlanId}
                        onClick={() => {
                          setEditing(stall._id);
                          setEditPrice(String(stall.basePrice));
                        }}
                        title={
                          BOOKING_OWNED.has(stall.status)
                            ? "Price can still change; the status is set by a live hold or booking."
                            : undefined
                        }
                      >
                        <Pencil aria-hidden />
                        Price
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
