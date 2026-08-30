"use client";

import * as React from "react";

import { clampToCanvas, findOverlappingPairs, snapToGrid, type Rect } from "@/lib/floor-plans/geometry";
import { formatMetres, unitsToMetres } from "@/lib/floor-plans/units";
import { statusColor } from "@/lib/ui/status";
import type { PlanElement, PlanStall } from "@/lib/ui/use-floor-plan";
import { cn } from "@/lib/utils";

type Geometry = PlanElement["geometry"];
type DragMode = "move" | "resize" | "rotate";

type Drag = {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  /** Geometry of the primary element when the gesture began. */
  origin: Geometry;
  /** Every element the gesture moves, with its own starting geometry. */
  members: Array<{ id: string; origin: Geometry }>;
  /** Element centre in viewport pixels, for the rotate handle. */
  anchor: { x: number; y: number };
};

const MIN_SIZE_UNITS = 10;
const RULER_THICKNESS = 22;

/** Colour for an element by kind: stalls follow availability, everything else is structural. */
function elementColors(element: PlanElement, stall: PlanStall | undefined) {
  if (element.type !== "STALL") {
    return { fill: "color-mix(in srgb, var(--ink-faint) 16%, transparent)", stroke: "var(--line-strong)" };
  }
  if (!stall) {
    // An unpriced rectangle is the state that produced unbookable maps, so it is called out rather
    // than drawn as though it were a normal available stall.
    return { fill: "color-mix(in srgb, var(--status-held) 14%, transparent)", stroke: "var(--status-held)" };
  }
  const colour = statusColor(stall.status);
  return { fill: `color-mix(in srgb, ${colour} 26%, transparent)`, stroke: colour };
}

/** Tick marks in metres along both axes, so the organizer never thinks in plan units. */
function Rulers({ canvasWidth, canvasHeight, scale }: { canvasWidth: number; canvasHeight: number; scale: number }) {
  // One label per 5 m, thinned further when zoomed out so labels cannot collide.
  const stepMetres = scale < 0.5 ? 20 : scale < 0.9 ? 10 : 5;
  const horizontal: number[] = [];
  for (let metres = 0; unitsToMetres(canvasWidth) >= metres; metres += stepMetres) horizontal.push(metres);
  const vertical: number[] = [];
  for (let metres = 0; unitsToMetres(canvasHeight) >= metres; metres += stepMetres) vertical.push(metres);

  return (
    <>
      <div
        className="pointer-events-none absolute top-0 left-0 border-b border-[var(--line)] bg-[var(--paper-sunken)]"
        style={{ height: RULER_THICKNESS, width: canvasWidth * scale + RULER_THICKNESS, marginLeft: RULER_THICKNESS }}
        aria-hidden
      >
        {horizontal.map((metres) => (
          <span
            key={metres}
            className="absolute top-1 font-mono text-[9px] text-[var(--ink-faint)]"
            style={{ left: metres * 20 * scale + 2 }}
          >
            {metres}m
          </span>
        ))}
      </div>
      <div
        className="pointer-events-none absolute top-0 left-0 border-r border-[var(--line)] bg-[var(--paper-sunken)]"
        style={{ width: RULER_THICKNESS, height: canvasHeight * scale + RULER_THICKNESS, marginTop: RULER_THICKNESS }}
        aria-hidden
      >
        {vertical.map((metres) => (
          <span
            key={metres}
            className="absolute left-1 font-mono text-[9px] text-[var(--ink-faint)]"
            style={{ top: metres * 20 * scale + 2 }}
          >
            {metres}m
          </span>
        ))}
      </div>
    </>
  );
}

export function EditorCanvas({
  canvasWidth,
  canvasHeight,
  gridSize,
  snap,
  backgroundUrl,
  elements,
  stallByElementId,
  selectedIds,
  scale,
  onScaleChange,
  onSelectionChange,
  onGeometryPreview,
  onGeometryCommit,
}: {
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  snap: boolean;
  backgroundUrl?: string;
  elements: PlanElement[];
  stallByElementId: Map<string, PlanStall>;
  selectedIds: string[];
  scale: number;
  onScaleChange: (scale: number) => void;
  onSelectionChange: (ids: string[]) => void;
  /** Called continuously during a gesture; local state only. */
  onGeometryPreview: (elementId: string, geometry: Geometry) => void;
  /** Called once when a gesture ends, with every element it changed. */
  onGeometryCommit: (changes: Array<{ elementId: string; geometry: Geometry }>) => void;
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const pan = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const canvas = { canvasWidth, canvasHeight };

  // Overlapping stalls are reported rather than prevented: two rectangles may legitimately be
  // stacked mid-edit, but publishing a plan where they are is a mistake worth surfacing.
  const overlappingIds = React.useMemo(() => {
    const stallElements = elements.filter((element) => element.type === "STALL");
    const pairs = findOverlappingPairs(stallElements.map((element) => element.geometry));
    const ids = new Set<string>();
    for (const [a, b] of pairs) {
      ids.add(stallElements[a]._id);
      ids.add(stallElements[b]._id);
    }
    return ids;
  }, [elements]);

  const fitToScreen = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = viewport.clientWidth - RULER_THICKNESS - 32;
    if (available <= 0) return;
    onScaleChange(Math.max(0.1, Math.min(2, available / canvasWidth)));
  }, [canvasWidth, onScaleChange]);

  // Fit once the viewport has a width, and again whenever the canvas is resized.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (drag.current) return;
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  function beginDrag(event: React.PointerEvent, element: PlanElement, mode: DragMode) {
    if (element.locked) return;
    event.preventDefault();
    event.stopPropagation();

    // A plain press on an unselected element selects just it, so a drag always has a valid subject.
    // Shift-click must not collapse the selection here — the click handler owns that toggle and
    // fires immediately after this same gesture.
    const activeSelection = selectedIds.includes(element._id) ? selectedIds : [element._id];
    if (!event.shiftKey && !selectedIds.includes(element._id)) onSelectionChange([element._id]);

    const canvasRect = (event.currentTarget as HTMLElement).closest("[data-canvas]")?.getBoundingClientRect();
    drag.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: element.geometry,
      members:
        mode === "move"
          ? activeSelection
              .map((id) => elements.find((candidate) => candidate._id === id))
              .filter((candidate): candidate is PlanElement => Boolean(candidate) && !candidate!.locked)
              .map((candidate) => ({ id: candidate._id, origin: candidate.geometry }))
          : [{ id: element._id, origin: element.geometry }],
      anchor: {
        // The rotate handle needs the element centre in viewport pixels to compare against the
        // pointer, and the canvas renders through a CSS transform, so geometry must be scaled.
        x: (canvasRect?.left ?? 0) + (element.geometry.x + element.geometry.width / 2) * scale,
        y: (canvasRect?.top ?? 0) + (element.geometry.y + element.geometry.height / 2) * scale,
      },
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;

    // Pointer movement is in screen pixels; the canvas is scaled, so deltas must be divided by the
    // scale or every drag would move the element by the wrong amount at any zoom but 100%.
    const dx = (event.clientX - active.startX) / scale;
    const dy = (event.clientY - active.startY) / scale;

    if (active.mode === "rotate") {
      const angle = (Math.atan2(event.clientY - active.anchor.y, event.clientX - active.anchor.x) * 180) / Math.PI + 90;
      const rotation = event.shiftKey ? Math.round(angle) : Math.round(angle / 15) * 15;
      onGeometryPreview(active.members[0].id, { ...active.origin, rotation });
      return;
    }

    if (active.mode === "resize") {
      const width = Math.max(MIN_SIZE_UNITS, snapToGrid(active.origin.width + dx, snap ? gridSize : 0));
      const height = Math.max(MIN_SIZE_UNITS, snapToGrid(active.origin.height + dy, snap ? gridSize : 0));
      onGeometryPreview(active.members[0].id, {
        ...active.origin,
        width: Math.min(width, canvasWidth - active.origin.x),
        height: Math.min(height, canvasHeight - active.origin.y),
      });
      return;
    }

    // Snap the primary element, then shift the rest of the selection by the same offset so their
    // relative spacing survives the drag.
    const primary = active.origin;
    const snappedX = snapToGrid(primary.x + dx, snap ? gridSize : 0);
    const snappedY = snapToGrid(primary.y + dy, snap ? gridSize : 0);
    const clamped = clampToCanvas({ ...primary, x: snappedX, y: snappedY } as Rect, canvas);
    const offsetX = clamped.x - primary.x;
    const offsetY = clamped.y - primary.y;

    for (const member of active.members) {
      const next = clampToCanvas(
        { ...member.origin, x: member.origin.x + offsetX, y: member.origin.y + offsetY } as Rect,
        canvas,
      );
      onGeometryPreview(member.id, { ...member.origin, x: next.x, y: next.y });
    }
  }

  function endDrag(event: React.PointerEvent) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);

    const changes = active.members
      .map((member) => {
        const element = elements.find((candidate) => candidate._id === member.id);
        return element ? { elementId: member.id, geometry: element.geometry } : null;
      })
      .filter((change): change is { elementId: string; geometry: Geometry } => change !== null)
      // Only persist what actually moved, so a stray click does not fire a write per selected item.
      .filter((change, index) => JSON.stringify(change.geometry) !== JSON.stringify(active.members[index].origin));

    if (changes.length > 0) onGeometryCommit(changes);
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    onSelectionChange([]);
    pan.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!pan.current || !viewport || drag.current) return;
    viewport.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
    viewport.scrollTop = pan.current.top - (event.clientY - pan.current.y);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-soft)]">
        <span className="font-mono">
          {formatMetres(canvasWidth)} x {formatMetres(canvasHeight)} · {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={fitToScreen}
          className="rounded-md border border-[var(--line-strong)] px-2 py-1 hover:bg-[var(--paper-sunken)]"
        >
          Fit to screen
        </button>
        <button
          type="button"
          onClick={() => onScaleChange(Math.min(2, Number((scale + 0.1).toFixed(2))))}
          className="rounded-md border border-[var(--line-strong)] px-2 py-1 hover:bg-[var(--paper-sunken)]"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onScaleChange(Math.max(0.1, Number((scale - 0.1).toFixed(2))))}
          className="rounded-md border border-[var(--line-strong)] px-2 py-1 hover:bg-[var(--paper-sunken)]"
          aria-label="Zoom out"
        >
          −
        </button>
        {overlappingIds.size > 0 && (
          <span className="text-[var(--status-held-ink)]">
            {overlappingIds.size} overlapping stall{overlappingIds.size === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div
        ref={viewportRef}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={() => {
          pan.current = null;
        }}
        className="relative max-h-[68vh] cursor-grab overflow-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] active:cursor-grabbing"
      >
        <Rulers canvasWidth={canvasWidth} canvasHeight={canvasHeight} scale={scale} />

        <div style={{ paddingLeft: RULER_THICKNESS, paddingTop: RULER_THICKNESS }}>
          <div
            style={{
              width: canvasWidth * scale,
              height: canvasHeight * scale,
            }}
          >
            <div
              data-canvas
              className="relative origin-top-left bg-[var(--card)] shadow-sm"
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `scale(${scale})`,
                backgroundImage: [
                  backgroundUrl ? `url(${backgroundUrl})` : null,
                  snap
                    ? `linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", "),
                backgroundSize: [backgroundUrl ? "100% 100%" : null, snap ? `${gridSize}px ${gridSize}px` : null]
                  .filter(Boolean)
                  .join(", "),
              }}
            >
              {elements.map((element) => {
                const stall = stallByElementId.get(element._id);
                const isSelected = selectedIds.includes(element._id);
                const overlapping = overlappingIds.has(element._id);
                const { fill, stroke } = elementColors(element, stall);

                return (
                  <div
                    key={element._id}
                    onPointerDown={(event) => beginDrag(event, element, "move")}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (event.shiftKey) {
                        onSelectionChange(
                          selectedIds.includes(element._id)
                            ? selectedIds.filter((id) => id !== element._id)
                            : [...selectedIds, element._id],
                        );
                      } else {
                        onSelectionChange([element._id]);
                      }
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded border font-mono text-[10px] font-semibold select-none",
                      isSelected ? "z-10 ring-2 ring-[var(--brand)]" : "",
                      overlapping && !isSelected ? "ring-2 ring-[var(--status-held)]" : "",
                      element.locked ? "cursor-not-allowed" : "cursor-move",
                      !element.visible ? "opacity-40" : "",
                    )}
                    style={{
                      left: element.geometry.x,
                      top: element.geometry.y,
                      width: element.geometry.width,
                      height: element.geometry.height,
                      transform: element.geometry.rotation ? `rotate(${element.geometry.rotation}deg)` : undefined,
                      backgroundColor: fill,
                      borderColor: isSelected ? "var(--brand)" : stroke,
                      color: "var(--ink)",
                    }}
                    title={
                      stall
                        ? `${stall.stallNumber} · ${stall.basePrice.toLocaleString()} ${stall.currency} · ${stall.status.toLowerCase()}`
                        : element.type === "STALL"
                          ? "Not bookable yet — give this rectangle a stall number and price"
                          : element.label ?? element.type
                    }
                  >
                    <span className="flex h-full w-full items-center justify-center px-1 text-center">
                      {stall?.stallNumber ?? element.label ?? element.type}
                    </span>

                    {isSelected && !element.locked && (
                      <>
                        <span
                          onPointerDown={(event) => beginDrag(event, element, "resize")}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          className="absolute right-0 bottom-0 size-3 cursor-se-resize rounded-tl bg-[var(--brand)]"
                          title="Drag to resize"
                        />
                        <span
                          onPointerDown={(event) => beginDrag(event, element, "rotate")}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          className="absolute -top-4 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full bg-[var(--brand)]"
                          title="Drag to rotate · hold Shift for free rotation"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
