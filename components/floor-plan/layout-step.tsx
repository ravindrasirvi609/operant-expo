"use client";

import * as React from "react";
import { CircleDot, Plus } from "lucide-react";
import { toast } from "sonner";

import { EditorCanvas } from "@/components/floor-plan/editor-canvas";
import { GridDialog } from "@/components/floor-plan/grid-dialog";
import { StallPanel } from "@/components/floor-plan/stall-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clampToCanvas, nextStallNumber } from "@/lib/floor-plans/geometry";
import { metresToUnits } from "@/lib/floor-plans/units";
import type { PlanElement, useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

const STRUCTURAL_TYPES = [
  { type: "ENTRANCE", label: "Entrance" },
  { type: "EXIT", label: "Exit" },
  { type: "WALKWAY", label: "Walkway" },
  { type: "STAGE", label: "Stage" },
  { type: "ZONE", label: "Zone" },
] as const;

function SaveIndicator({ api }: { api: PlanApi }) {
  const text =
    api.saveState === "saving"
      ? "Saving…"
      : api.saveState === "saved"
        ? "All changes saved"
        : api.saveState === "failed"
          ? api.saveError
          : "";
  return (
    <span
      aria-live="polite"
      className="font-mono text-xs"
      style={{ color: api.saveState === "failed" ? "var(--status-booked-ink)" : "var(--ink-faint)" }}
    >
      {text || " "}
    </span>
  );
}

/**
 * Step 2: placing and pricing the stalls.
 *
 * Everything a stall needs is here — geometry on the canvas, commercial detail in the panel — so a
 * placed stall is bookable before the organizer leaves the screen. The old editor could only create
 * rectangles, which is why published maps ended up with nothing behind them.
 */
export function LayoutStep({ api }: { api: PlanApi }) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [snap, setSnap] = React.useState(true);
  const [scale, setScale] = React.useState(1);

  const plan = api.plan;
  const selected = api.elements.find((element) => element._id === selectedIds[selectedIds.length - 1]);
  const selectedStall = selected ? api.stallByElementId.get(selected._id) : undefined;

  const commitGeometry = React.useCallback(
    async (changes: Array<{ elementId: string; geometry: PlanElement["geometry"] }>) => {
      for (const change of changes) {
        const stall = api.stallByElementId.get(change.elementId);
        if (stall) {
          await api.updateStall(stall._id, { geometry: change.geometry });
        }
        // A structural element has no stall record; its geometry is not editable through this
        // endpoint yet, so it is left as a local move until it is re-placed.
      }
    },
    [api],
  );

  async function addStall() {
    if (!plan) return;
    const size = metresToUnits(3);
    const count = api.elements.length;
    // Lay new stalls out in a loose grid so repeated clicks do not stack them on top of each other.
    const geometry = clampToCanvas(
      {
        x: metresToUnits(1) + (count % 6) * (size + metresToUnits(0.5)),
        y: metresToUnits(1) + Math.floor(count / 6) * (size + metresToUnits(1)),
        width: size,
        height: size,
      },
      plan,
    );

    const stallNumber = nextStallNumber(
      api.stalls.map((stall) => stall.stallNumber),
      api.stalls.at(-1)?.stallNumber ?? "A-1",
    );

    const result = await api.createStall({
      geometry: { type: "rect", ...geometry },
      stallNumber,
      label: stallNumber,
      stallType: "STANDARD",
      basePrice: 0,
      currency: api.stalls.at(-1)?.currency ?? "INR",
      amenities: [],
      visibility: "PUBLIC",
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSelectedIds([result.data.element._id]);
    toast.success(`${stallNumber} added. Set its price in the panel.`);
  }

  async function addStructural(type: (typeof STRUCTURAL_TYPES)[number]["type"], label: string) {
    if (!plan) return;
    const geometry = clampToCanvas(
      { x: metresToUnits(1), y: metresToUnits(1), width: metresToUnits(4), height: metresToUnits(2) },
      plan,
    );
    const result = await api.createElement({ type, label, geometry: { type: "rect", ...geometry } });
    if (!result.ok) toast.error(result.error);
    else toast.success(`${label} added.`);
  }

  async function deleteSelected() {
    const stalls = selectedIds
      .map((id) => api.stallByElementId.get(id))
      .filter((stall): stall is NonNullable<typeof stall> => Boolean(stall));

    if (stalls.length === 0) {
      toast.error("Select a stall to delete. Entrances and zones cannot be removed here yet.");
      return;
    }

    let removed = 0;
    for (const stall of stalls) {
      const result = await api.deleteStall(stall._id);
      if (result.ok) removed += 1;
      else toast.error(result.error);
    }
    if (removed > 0) toast.success(`${removed} stall${removed === 1 ? "" : "s"} removed.`);
    setSelectedIds([]);
  }

  // Arrow keys nudge, Delete removes. Skipped while a form control has focus so typing a stall
  // number in the panel cannot move the stall behind it.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!plan || selectedIds.length === 0) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void deleteSelected();
        return;
      }

      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const delta = deltas[event.key];
      if (!delta) return;

      event.preventDefault();
      const step = event.shiftKey ? plan.gridSize : 1;
      const changes: Array<{ elementId: string; geometry: PlanElement["geometry"] }> = [];

      for (const id of selectedIds) {
        const element = api.elements.find((candidate) => candidate._id === id);
        if (!element || element.locked) continue;
        const moved = clampToCanvas(
          { ...element.geometry, x: element.geometry.x + delta[0] * step, y: element.geometry.y + delta[1] * step },
          plan,
        );
        const geometry = { ...element.geometry, x: moved.x, y: moved.y };
        api.applyLocalGeometry(id, geometry);
        changes.push({ elementId: id, geometry });
      }
      if (changes.length > 0) void commitGeometry(changes);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, selectedIds, api.elements]);

  if (!plan) {
    return (
      <Alert variant="warning">
        <AlertDescription>Create the canvas on the previous step before placing stalls.</AlertDescription>
      </Alert>
    );
  }

  const unlinkedCount = api.elements.filter(
    (element) => element.type === "STALL" && !api.stallByElementId.has(element._id),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void addStall()}>
          <Plus aria-hidden />
          Add one stall
        </Button>
        <GridDialog api={api} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <CircleDot aria-hidden />
              Add feature
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STRUCTURAL_TYPES.map((item) => (
              <DropdownMenuItem key={item.type} onSelect={() => void addStructural(item.type, item.label)}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Label className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm">
          <Checkbox checked={snap} onCheckedChange={(checked) => setSnap(checked === true)} />
          Snap to grid
        </Label>

        <Button size="sm" variant="destructive" onClick={() => void deleteSelected()} disabled={selectedIds.length === 0}>
          Delete
        </Button>

        <div className="ml-auto">
          <SaveIndicator api={api} />
        </div>
      </div>

      {unlinkedCount > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {unlinkedCount} rectangle{unlinkedCount === 1 ? "" : "s"} on this plan {unlinkedCount === 1 ? "has" : "have"}{" "}
            no price, so visitors cannot book {unlinkedCount === 1 ? "it" : "them"}. Select{" "}
            {unlinkedCount === 1 ? "it" : "each one"} and set a price.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <EditorCanvas
          canvasWidth={plan.canvasWidth}
          canvasHeight={plan.canvasHeight}
          gridSize={plan.gridSize}
          snap={snap}
          backgroundUrl={api.background?.url}
          elements={api.elements}
          stallByElementId={api.stallByElementId}
          selectedIds={selectedIds}
          scale={scale}
          onScaleChange={setScale}
          onSelectionChange={setSelectedIds}
          onGeometryPreview={api.applyLocalGeometry}
          onGeometryCommit={(changes) => void commitGeometry(changes)}
        />

        <Card className="h-fit p-5">
          <h3 className="font-display font-semibold text-[var(--ink)]">
            {selectedIds.length > 1 ? `${selectedIds.length} selected` : selected ? "Stall properties" : "Nothing selected"}
          </h3>

          {selectedIds.length > 1 ? (
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Drag to move them together, or press Delete to remove them. Select a single stall to edit its details.
            </p>
          ) : selected ? (
            selected.type === "STALL" ? (
              <div className="mt-4">
                <StallPanel
                  key={selected._id}
                  api={api}
                  element={selected}
                  stall={selectedStall}
                  onDeleted={() => setSelectedIds([])}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--ink-soft)]">
                {selected.label ?? selected.type} is a layout feature, not bookable inventory. Drag it to reposition it.
              </p>
            )
          ) : (
            <div className="mt-2 space-y-2 text-sm text-[var(--ink-soft)]">
              <p>Click a stall to edit it. Drag to move, use the corner handle to resize.</p>
              <p className="text-xs text-[var(--ink-faint)]">
                Shift-click to select several · arrow keys nudge · Shift+arrow moves by one grid step · Delete removes.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
