"use client";

import { useMemo, useState } from "react";

type Element = { _id: string; type: string; label?: string; status?: string; geometry: { x: number; y: number; width: number; height: number; rotation?: number }; visible: boolean };

const colors: Record<string, string> = { AVAILABLE: "#bbf7d0", HELD: "#fde68a", BOOKED: "#fecaca", BLOCKED: "#e4e4e7" };

export function MapViewer({ width, height, backgroundUrl, elements }: { width: number; height: number; backgroundUrl?: string; elements: Element[] }) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const visible = useMemo(() => elements.filter((element) => element.visible), [elements]);
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><button onClick={() => setZoom((value) => Math.min(3, value + 0.2))} className="rounded border px-3 py-1.5 text-sm">Zoom in</button><button onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))} className="rounded border px-3 py-1.5 text-sm">Zoom out</button><button onClick={() => setZoom(1)} className="rounded border px-3 py-1.5 text-sm">Reset</button><span className="text-sm text-zinc-500">{Math.round(zoom * 100)}% · {visible.length} elements</span></div><div className="max-h-[70vh] overflow-auto rounded-xl border bg-zinc-100 p-4" aria-label="Interactive exhibition map"><div className="relative origin-top-left shadow-sm transition-transform" style={{ width, height, transform: `scale(${zoom})`, backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined, backgroundSize: "100% 100%", backgroundColor: "white" }}>{visible.map((element) => <button key={element._id} aria-label={element.label ?? element.type} onClick={() => setSelected(element._id)} className={`absolute overflow-hidden rounded border text-[10px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-600 ${selected === element._id ? "z-20 ring-2 ring-indigo-600" : ""}`} style={{ left: element.geometry.x, top: element.geometry.y, width: element.geometry.width, height: element.geometry.height, transform: `rotate(${element.geometry.rotation ?? 0}deg)`, backgroundColor: element.type === "STALL" ? colors[element.status ?? "AVAILABLE"] : "#dbeafe" }}>{element.label ?? element.type}</button>)}</div></div>{selected && <p className="text-sm text-zinc-600">Selected map element: {visible.find((element) => element._id === selected)?.label ?? "Unnamed element"}</p>}</div>;
}

