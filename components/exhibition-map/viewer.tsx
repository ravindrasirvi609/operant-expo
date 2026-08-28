"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { statusColor } from "@/components/ui/status-badge";

type Element = { _id: string; stallId?: string; type: string; label?: string; status?: string; geometry: { x: number; y: number; width: number; height: number; rotation?: number }; visible: boolean };

const LEGEND: Array<{ status: string; label: string }> = [
  { status: "AVAILABLE", label: "Available" },
  { status: "HELD", label: "Held" },
  { status: "BOOKED", label: "Booked" },
  { status: "BLOCKED", label: "Blocked" },
];

export function MapViewer({ width, height, backgroundUrl, elements, bookingBasePath = "/exhibitions" }: { width: number; height: number; backgroundUrl?: string; elements: Element[]; bookingBasePath?: string }) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const pan = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const visible = useMemo(() => elements.filter((element) => element.visible), [elements]);

  function selectElement(element: Element) {
    setSelected(element._id);
    if (element.stallId && element.status !== "BOOKED" && element.status !== "BLOCKED") {
      // The slug sits at path segment 2 under both /exhibitions/{slug} and /embed/{slug} — only
      // the base path differs, which callers control via bookingBasePath so the widget never
      // navigates a visitor out of the iframe and onto the full-chrome public page.
      const slug = window.location.pathname.split("/")[2];
      router.push(`${bookingBasePath}/${slug}/book/${element.stallId}`);
    }
  }

  function beginPan(e: React.PointerEvent<HTMLDivElement>) {
    if (!viewportRef.current) return;
    pan.current = { startX: e.clientX, startY: e.clientY, scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop };
    viewportRef.current.setPointerCapture(e.pointerId);
  }
  function movePan(e: React.PointerEvent<HTMLDivElement>) {
    if (!pan.current || !viewportRef.current) return;
    viewportRef.current.scrollLeft = pan.current.scrollLeft - (e.clientX - pan.current.startX);
    viewportRef.current.scrollTop = pan.current.scrollTop - (e.clientY - pan.current.startY);
  }
  function endPan(e: React.PointerEvent<HTMLDivElement>) {
    pan.current = null;
    viewportRef.current?.releasePointerCapture(e.pointerId);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setZoom((value) => Math.min(3, value + 0.2))} className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]">Zoom in</button>
          <button onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))} className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]">Zoom out</button>
          <button onClick={() => setZoom(1)} className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--ink)]">Reset</button>
          <span className="font-mono text-sm text-[var(--ink-soft)]">{Math.round(zoom * 100)}% · {visible.length} elements</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-[var(--ink-soft)]">
          {LEGEND.map((item) => (
            <span key={item.status} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor(item.status) }} aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        className="max-h-[70vh] cursor-grab overflow-auto rounded-xl border border-[var(--line)] bg-blueprint-grid p-4 active:cursor-grabbing"
        aria-label="Interactive exhibition map"
      >
        <div
          className="relative origin-top-left bg-[var(--paper-raised)] shadow-sm transition-transform"
          style={{ width, height, transform: `scale(${zoom})`, backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined, backgroundSize: "100% 100%" }}
        >
          {visible.map((element) => {
            const color = statusColor(element.status ?? "AVAILABLE");
            return (
              <button
                key={element._id}
                aria-label={element.label ?? element.type}
                onClick={() => selectElement(element)}
                disabled={element.status === "BOOKED" || element.status === "BLOCKED"}
                className={`absolute overflow-hidden rounded border font-mono text-[10px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${selected === element._id ? "z-20 ring-2 ring-[var(--accent)]" : ""}`}
                style={{
                  left: element.geometry.x,
                  top: element.geometry.y,
                  width: element.geometry.width,
                  height: element.geometry.height,
                  transform: `rotate(${element.geometry.rotation ?? 0}deg)`,
                  backgroundColor: element.type === "STALL" ? `color-mix(in srgb, ${color} 30%, transparent)` : "color-mix(in srgb, var(--ink-faint) 15%, transparent)",
                  borderColor: element.type === "STALL" ? color : "var(--line-strong)",
                  color: "var(--ink)",
                }}
              >
                {element.label ?? element.type}
              </button>
            );
          })}
        </div>
      </div>
      {selected && <p className="text-sm text-[var(--ink-soft)]">Selected: {visible.find((element) => element._id === selected)?.label ?? "Unnamed element"}</p>}
    </div>
  );
}
