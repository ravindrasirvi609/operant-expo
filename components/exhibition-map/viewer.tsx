"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { PUBLIC_LEGEND_STATUSES, statusColor, statusLabel } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

export type ViewerElement = {
  id: string;
  type: string;
  label?: string;
  geometry: { x: number; y: number; width: number; height: number; rotation?: number };
  /** Present when the rectangle has bookable inventory behind it. */
  stallId?: string;
  /** Status used to colour the rectangle. Absent means "no inventory here". */
  status?: string;
  bookable?: boolean;
  reason?: string;
};

const LEGEND = PUBLIC_LEGEND_STATUSES.map((status) => ({ status, label: statusLabel(status) }));

/**
 * The interactive exhibition map, shown to visitors and reused for the organizer's preview.
 *
 * Purely presentational: it reports which stall was chosen and lets the caller decide what that
 * means. It used to navigate by itself, deriving the exhibition slug from
 * `window.location.pathname.split("/")[2]` — which silently coupled it to two specific URL shapes
 * and would have broken under any other route.
 *
 * Only rectangles the server marked bookable are buttons. Entrances, stages, walkways, sold stalls
 * and rectangles with no inventory render as plain elements, so they are neither clickable nor in
 * the keyboard tab order ahead of the stalls a visitor came to book.
 */
export function MapViewer({
  width,
  height,
  backgroundUrl,
  elements,
  onSelectStall,
  selectedStallId,
}: {
  width: number;
  height: number;
  backgroundUrl?: string;
  elements: ViewerElement[];
  /** Omit to render a read-only map. */
  onSelectStall?: (stallId: string) => void;
  selectedStallId?: string;
}) {
  const [zoom, setZoom] = React.useState(1);
  const pan = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);

  const interactive = Boolean(onSelectStall);
  const bookableCount = elements.filter((element) => element.bookable && element.stallId).length;

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    pan.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!pan.current || !viewport) return;
    viewport.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
    viewport.scrollTop = pan.current.top - (event.clientY - pan.current.y);
  }

  function fitToScreen() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const available = viewport.clientWidth - 32;
    if (available > 0) setZoom(Math.max(0.2, Math.min(2, available / width)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fitToScreen}>
            Fit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.min(3, value + 0.2))}>
            Zoom in
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom((value) => Math.max(0.3, value - 0.2))}>
            Zoom out
          </Button>
          <span className="font-mono text-xs text-[var(--ink-soft)]">
            {Math.round(zoom * 100)}%
            {interactive ? ` · ${bookableCount} available to reserve` : ""}
          </span>
        </div>
        <ul className="flex flex-wrap items-center gap-3 font-mono text-xs text-[var(--ink-soft)]">
          {LEGEND.map((item) => (
            <li key={item.status} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: statusColor(item.status) }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={() => {
          pan.current = null;
        }}
        className="max-h-[70vh] cursor-grab overflow-auto rounded-xl border border-[var(--line)] bg-blueprint-grid p-4 active:cursor-grabbing"
        aria-label="Exhibition floor plan"
      >
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="relative origin-top-left bg-[var(--card)] shadow-sm"
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
              backgroundSize: "100% 100%",
            }}
          >
            {elements.map((element) => {
              const isStall = element.type === "STALL";
              const colour = element.status ? statusColor(element.status) : "var(--ink-faint)";
              const clickable = interactive && element.bookable && Boolean(element.stallId);

              const style: React.CSSProperties = {
                left: element.geometry.x,
                top: element.geometry.y,
                width: element.geometry.width,
                height: element.geometry.height,
                transform: element.geometry.rotation ? `rotate(${element.geometry.rotation}deg)` : undefined,
                backgroundColor: isStall
                  ? `color-mix(in srgb, ${colour} 30%, transparent)`
                  : "color-mix(in srgb, var(--ink-faint) 14%, transparent)",
                borderColor: isStall ? colour : "var(--line-strong)",
                color: "var(--ink)",
              };

              const label = element.label ?? element.type;

              if (!clickable) {
                return (
                  <div
                    key={element.id}
                    aria-hidden
                    className="absolute overflow-hidden rounded border font-mono text-[10px] font-semibold"
                    style={style}
                    title={
                      isStall && element.status
                        ? `${label} — ${statusLabel(element.status)}`
                        : isStall
                          ? `${label} — not available`
                          : label
                    }
                  >
                    <span className="flex h-full w-full items-center justify-center px-1 text-center">{label}</span>
                  </div>
                );
              }

              return (
                <button
                  key={element.id}
                  onClick={() => onSelectStall?.(element.stallId!)}
                  aria-label={`Stall ${label} — available, view details`}
                  className={cn(
                    "absolute overflow-hidden rounded border font-mono text-[10px] font-semibold transition hover:brightness-95",
                    selectedStallId === element.stallId ? "z-20 ring-2 ring-[var(--brand)]" : "",
                  )}
                  style={style}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
