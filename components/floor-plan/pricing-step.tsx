"use client";

import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STALL_TYPES, STALL_TYPE_LABELS, VISIBILITIES } from "@/lib/validation/map";
import type { useFloorPlan } from "@/lib/ui/use-floor-plan";
import { Grid3x3 } from "lucide-react";

type PlanApi = ReturnType<typeof useFloorPlan>;

/**
 * Step 3: pricing the inventory.
 *
 * The same records the layout step creates, in a table, so a whole section can be repriced without
 * clicking through the canvas one rectangle at a time. Unpriced stalls are called out because they
 * are the thing that blocks publishing.
 */
export function PricingStep({ api }: { api: PlanApi }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkPrice, setBulkPrice] = React.useState("");
  const [bulkType, setBulkType] = React.useState("");
  const [bulkVisibility, setBulkVisibility] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const stalls = api.stalls;
  const unpriced = stalls.filter((stall) => stall.basePrice <= 0);
  const currency = stalls[0]?.currency ?? "";
  const total = stalls.reduce((sum, stall) => sum + stall.basePrice, 0);

  function toggle(stallId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(stallId)) next.delete(stallId);
      else next.add(stallId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => (current.size === stalls.length ? new Set() : new Set(stalls.map((stall) => stall._id))));
  }

  const hasBulkChange = bulkPrice !== "" || bulkType !== "" || bulkVisibility !== "";

  async function applyBulk() {
    setBusy(true);
    const patch: Record<string, unknown> = {};
    if (bulkPrice !== "") patch.basePrice = Number(bulkPrice);
    if (bulkType !== "") patch.stallType = bulkType;
    if (bulkVisibility !== "") patch.visibility = bulkVisibility;

    // Applied one at a time so a single rejection (a stall held by a visitor, say) does not discard
    // the rest, and the count reported back is the truth.
    let updated = 0;
    const failures: string[] = [];
    for (const stallId of selected) {
      const result = await api.updateStall(stallId, patch);
      if (result.ok) updated += 1;
      else failures.push(result.error);
    }

    setBusy(false);
    if (updated > 0) toast.success(`${updated} stall${updated === 1 ? "" : "s"} updated.`);
    if (failures.length > 0) toast.error(`${failures.length} could not be updated. ${failures[0]}`);
    setSelected(new Set());
    setBulkPrice("");
    setBulkType("");
    setBulkVisibility("");
  }

  if (stalls.length === 0) {
    return (
      <EmptyState
        icon={Grid3x3}
        title="No stalls to price yet"
        description="Go back to the layout step and place some stalls. The grid generator prices them all at once."
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
            {unpriced.length > 8 ? ` and ${unpriced.length - 8} more` : ""}. Set a price before publishing.
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set(unpriced.map((stall) => stall._id)))}
              >
                Select them
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b border-[var(--line)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Stall inventory</CardTitle>
              <CardDescription>
                {stalls.length} stall{stalls.length === 1 ? "" : "s"} · {total.toLocaleString()} {currency} total ·{" "}
                {stalls.filter((stall) => stall.visibility === "PUBLIC").length} public
              </CardDescription>
            </div>
            {selected.size > 0 && (
              <span className="rounded-full border border-[var(--brand)] px-3 py-1 font-mono text-xs text-[var(--brand-quiet)]">
                {selected.size} selected
              </span>
            )}
          </div>
        </CardHeader>

        {selected.size > 0 && (
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
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void applyBulk()} loading={busy} disabled={!hasBulkChange}>
                Apply to {selected.size} stall{selected.size === 1 ? "" : "s"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selected.size === stalls.length && stalls.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Select all stalls"
                />
              </TableHead>
              <TableHead>Stall</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visibility</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stalls.map((stall) => (
              <TableRow key={stall._id} data-state={selected.has(stall._id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(stall._id)}
                    onCheckedChange={() => toggle(stall._id)}
                    aria-label={`Select ${stall.stallNumber}`}
                  />
                </TableCell>
                <TableCell className="font-mono font-medium text-[var(--ink)]">
                  {stall.stallNumber}
                  {stall.section && <span className="ml-2 text-[var(--ink-faint)]">{stall.section}</span>}
                </TableCell>
                <TableCell className="text-[var(--ink-soft)]">
                  {STALL_TYPE_LABELS[stall.stallType as (typeof STALL_TYPES)[number]] ?? stall.stallType}
                </TableCell>
                <TableCell className="font-mono tabular whitespace-nowrap">
                  {stall.width} x {stall.height} m
                </TableCell>
                <TableCell
                  className="font-mono tabular"
                  style={stall.basePrice <= 0 ? { color: "var(--status-booked-ink)" } : undefined}
                >
                  {stall.basePrice > 0 ? `${stall.basePrice.toLocaleString()} ${stall.currency}` : "not set"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={stall.status} />
                </TableCell>
                <TableCell className="text-[var(--ink-soft)]">{stall.visibility.toLowerCase()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
