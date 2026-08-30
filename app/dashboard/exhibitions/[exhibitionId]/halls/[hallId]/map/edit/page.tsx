"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiRequest } from "@/lib/http/client";

type Geometry = { type: "rect"; x: number; y: number; width: number; height: number; rotation?: number };
type Element = { _id: string; type: string; label?: string; geometry: Geometry; locked: boolean; visible: boolean; zIndex: number };
type Plan = { _id: string; canvasWidth: number; canvasHeight: number; version: number };
type DragMode = "move" | "resize" | "rotate";
type Drag = { mode: DragMode; startX: number; startY: number; geometry: Geometry; ids: string[]; anchor: { x: number; y: number } };

const GRID_SIZE = 10;

function snapValue(value: number, snap: boolean) {
  return snap ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

export default function Editor({ params, searchParams }: { params: Promise<{ exhibitionId: string; hallId: string }>; searchParams: Promise<{ organizationId?: string }> }) {
  const [ids, setIds] = useState<{ exhibitionId: string; hallId: string; organizationId: string }>();
  const [plan, setPlan] = useState<Plan>();
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Without this the editor could not tell "the request is in flight" from "there is no plan",
  // so a hall with no floor plan sat on "Loading map editor..." forever with no way out.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [snap, setSnap] = useState(true);
  const drag = useRef<Drag | undefined>(undefined);
  const history = useRef<{ past: Element[][]; future: Element[][] }>({ past: [], future: [] });
  // Mirrors history.current's stack sizes purely so the Undo/Redo buttons can react to them —
  // refs themselves must never be read during render.
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  const selected = elements.find((element) => element._id === selectedIds[selectedIds.length - 1]);

  useEffect(() => { Promise.all([params, searchParams]).then(([p, q]) => setIds({ ...p, organizationId: q.organizationId ?? "" })); }, [params, searchParams]);

  useEffect(() => {
    if (!ids?.organizationId) return;
    const load = async () => {
      setLoadState("loading");
      const plans = await apiGet<{ floorPlans: Plan[] }>(
        `/api/organizations/${ids.organizationId}/exhibitions/${ids.exhibitionId}/halls/${ids.hallId}/floor-plans`,
      );
      if (!plans.ok) {
        setError(plans.error);
        setLoadState("failed");
        return;
      }

      const current = plans.data.floorPlans?.[0];
      if (!current) {
        setLoadState("missing");
        return;
      }
      setPlan(current);

      const elementResult = await apiGet<{ elements: Element[] }>(
        `/api/organizations/${ids.organizationId}/floor-plans/${current._id}/elements`,
      );
      if (!elementResult.ok) {
        setError(elementResult.error);
        setLoadState("failed");
        return;
      }
      setElements(elementResult.data.elements ?? []);
      setLoadState("ready");
    };
    void load();
  }, [ids]);

  function pushHistory() {
    history.current.past.push(elements.map((element) => ({ ...element, geometry: { ...element.geometry } })));
    history.current.future = [];
    setHistoryCounts({ past: history.current.past.length, future: 0 });
  }

  /** Reconciles the canvas back to a snapshot by PATCHing every element whose geometry/label
   * differs. Undo/redo only ever operates on elements that already exist on both sides (adds and
   * deletes are deliberate, immediate actions and are intentionally excluded from the history
   * stack — this keeps reconciliation a pure "patch what changed" operation with no id churn). */
  async function reconcileTo(target: Element[]) {
    if (!ids || !plan) return;
    setSaving(true);
    await Promise.all(target.map(async (targetElement) => {
      const current = elements.find((element) => element._id === targetElement._id);
      if (!current) return;
      if (JSON.stringify(current.geometry) === JSON.stringify(targetElement.geometry) && current.label === targetElement.label) return;
      const result = await apiRequest(
        `/api/organizations/${ids.organizationId}/floor-plans/${plan._id}/elements/${targetElement._id}`,
        { method: "PATCH", json: { geometry: targetElement.geometry, label: targetElement.label } },
      );
      if (!result.ok) toast.error(result.error);
    }));
    setElements(target);
    setSaving(false);
  }

  function undo() {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(elements.map((element) => ({ ...element, geometry: { ...element.geometry } })));
    setHistoryCounts({ past: history.current.past.length, future: history.current.future.length });
    void reconcileTo(previous);
  }

  function redo() {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(elements.map((element) => ({ ...element, geometry: { ...element.geometry } })));
    setHistoryCounts({ past: history.current.past.length, future: history.current.future.length });
    void reconcileTo(next);
  }

  async function save(element: Element, patch: Partial<Element>) {
    if (!ids || !plan) return;
    setSaving(true);
    const result = await apiRequest<{ element: Element }>(
      `/api/organizations/${ids.organizationId}/floor-plans/${plan._id}/elements/${element._id}`,
      { method: "PATCH", json: patch },
    );
    if (!result.ok) toast.error(result.error);
    else setElements((all) => all.map((x) => (x._id === element._id ? result.data.element : x)));
    setSaving(false);
  }

  async function addStall() {
    if (!ids || !plan) return;
    const n = elements.length;
    const body = { type: "STALL", label: `Stall ${n + 1}`, status: "AVAILABLE", geometry: { type: "rect", x: 30 + (n % 6) * 120, y: 30 + Math.floor(n / 6) * 120, width: 90, height: 90 }, locked: false, visible: true, zIndex: 1 };
    const result = await apiRequest<{ element: Element }>(
      `/api/organizations/${ids.organizationId}/floor-plans/${plan._id}/elements`,
      { method: "POST", json: body },
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setElements((all) => [...all, result.data.element]);
    setSelectedIds([result.data.element._id]);
  }

  async function deleteSelected() {
    if (!ids || !plan || selectedIds.length === 0) return;
    setSaving(true);
    const results = await Promise.all(
      selectedIds.map((elementId) =>
        apiRequest(`/api/organizations/${ids.organizationId}/floor-plans/${plan._id}/elements/${elementId}`, {
          method: "DELETE",
        }),
      ),
    );
    const failed = results.filter((result) => !result.ok);
    if (failed.length > 0) {
      // Report the count rather than one message per element, and drop only what really went.
      toast.error(`Could not delete ${failed.length} of ${results.length} elements.`);
    }
    const deletedIds = selectedIds.filter((_, index) => results[index].ok);
    setElements((all) => all.filter((element) => !deletedIds.includes(element._id)));
    setSelectedIds([]);
    history.current.past = [];
    history.current.future = [];
    setHistoryCounts({ past: 0, future: 0 });
    setSaving(false);
  }

  function selectElement(event: React.MouseEvent, elementId: string) {
    if (event.shiftKey) {
      setSelectedIds((current) => (current.includes(elementId) ? current.filter((id) => id !== elementId) : [...current, elementId]));
    } else {
      setSelectedIds([elementId]);
    }
  }

  function begin(e: React.PointerEvent, element: Element, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    // A plain pointerdown on an unselected element selects just that element (so a drag always
    // has something valid to move). A shift-click must NOT collapse the selection here — the
    // click handler (selectElement) owns shift-click add/remove toggling, and runs right after
    // this same gesture's pointerup. Touching selection here on a shift-click would race with it.
    if (!e.shiftKey && !selectedIds.includes(element._id)) setSelectedIds([element._id]);
    pushHistory();
    // The rotate handle needs the element's center in viewport coordinates (to match
    // e.clientX/clientY), not canvas-logical coordinates — the canvas renders at 1:1 scale, so
    // this is just the canvas's own bounding-rect origin plus the element's local center.
    const canvasRect = (e.currentTarget as HTMLElement).closest("[data-canvas]")?.getBoundingClientRect();
    const anchor = {
      x: (canvasRect?.left ?? 0) + element.geometry.x + element.geometry.width / 2,
      y: (canvasRect?.top ?? 0) + element.geometry.y + element.geometry.height / 2,
    };
    drag.current = { mode, startX: e.clientX, startY: e.clientY, geometry: { ...element.geometry }, ids: mode === "move" ? (selectedIds.includes(element._id) ? selectedIds : [element._id]) : [element._id], anchor };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent, primary: Element) {
    const d = drag.current;
    if (!d || !plan) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const g = d.geometry;

    if (d.mode === "rotate") {
      const angle = (Math.atan2(e.clientY - d.anchor.y, e.clientX - d.anchor.x) * 180) / Math.PI + 90;
      const rotation = e.shiftKey ? Math.round(angle) : Math.round(angle / 15) * 15;
      const updated = { ...primary, geometry: { ...primary.geometry, rotation } };
      setSelectedIds([primary._id]);
      setElements((all) => all.map((x) => (x._id === primary._id ? updated : x)));
      return;
    }

    const next = d.mode === "move"
      ? { ...g, x: Math.max(0, Math.min(plan.canvasWidth - g.width, snapValue(g.x + dx, snap))), y: Math.max(0, Math.min(plan.canvasHeight - g.height, snapValue(g.y + dy, snap))) }
      : { ...g, width: Math.max(24, Math.min(plan.canvasWidth - g.x, snapValue(g.width + dx, snap))), height: Math.max(24, Math.min(plan.canvasHeight - g.y, snapValue(g.height + dy, snap))) };

    if (d.mode === "move" && d.ids.length > 1) {
      const offsetX = next.x - g.x;
      const offsetY = next.y - g.y;
      setElements((all) => all.map((x) => (d.ids.includes(x._id) ? { ...x, geometry: { ...x.geometry, x: x.geometry.x + offsetX, y: x.geometry.y + offsetY } } : x)));
    } else {
      setElements((all) => all.map((x) => (x._id === primary._id ? { ...x, geometry: next } : x)));
    }
  }

  function end(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    drag.current = undefined;
    for (const id of d.ids) {
      const current = elements.find((x) => x._id === id);
      if (current) void save(current, { geometry: current.geometry });
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length > 0) {
        event.preventDefault();
        void deleteSelected();
        return;
      }
      if (selectedIds.length === 1 && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const element = elements.find((x) => x._id === selectedIds[0]);
        if (!element || !plan) return;
        pushHistory();
        const delta = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[event.key] as [number, number];
        const nextGeometry = { ...element.geometry, x: Math.max(0, Math.min(plan.canvasWidth - element.geometry.width, element.geometry.x + delta[0])), y: Math.max(0, Math.min(plan.canvasHeight - element.geometry.height, element.geometry.y + delta[1])) };
        setElements((all) => all.map((x) => (x._id === element._id ? { ...x, geometry: nextGeometry } : x)));
        void save({ ...element, geometry: nextGeometry }, { geometry: nextGeometry });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedIds, plan, snap]);

  if (!ids || loadState === "loading") {
    return (
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-96" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="h-64" />
        </div>
      </main>
    );
  }

  const setupHref = `/dashboard/exhibitions/${ids.exhibitionId}/halls/${ids.hallId}/map/setup?organizationId=${ids.organizationId}`;

  if (loadState === "missing") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SectionEyebrow>Map editor</SectionEyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">No floor plan yet</h1>
        <EmptyState
          className="mt-8"
          icon={LayoutTemplate}
          title="This hall has no floor plan"
          description="A floor plan defines the coordinate space stalls are placed in. Create one, then come back here to draw and price the stalls."
          action={
            <Button asChild>
              <Link href={setupHref}>Create floor plan</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (loadState === "failed" || !plan) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <SectionEyebrow>Map editor</SectionEyebrow>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Couldn&apos;t open the editor</h1>
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Loading failed</AlertTitle>
          <AlertDescription>{error || "The floor plan could not be loaded."}</AlertDescription>
        </Alert>
        <Button className="mt-6" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionEyebrow>Map editor</SectionEyebrow>
          <h1 className="mt-1 font-display text-3xl font-semibold text-[var(--ink)]">Floor plan v{plan.version}</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Drag to move · shift-click to multi-select · handle to resize · top handle to rotate · arrows to nudge · Delete to remove · Ctrl+Z to undo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={historyCounts.past === 0}>
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={historyCounts.future === 0}>
            Redo
          </Button>
          <Label className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm">
            <Checkbox checked={snap} onCheckedChange={(checked) => setSnap(checked === true)} />
            Snap to grid
          </Label>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void deleteSelected()}
            disabled={selectedIds.length === 0}
          >
            Delete
          </Button>
          <Button size="sm" onClick={() => void addStall()}>
            Add stall
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p aria-live="polite" className="mt-2 font-mono text-xs text-[var(--brand-quiet)]">
        {saving ? "Saving…" : " "}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="overflow-auto rounded-xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <div
            data-canvas
            onPointerDown={() => setSelectedIds([])}
            className="relative bg-[var(--paper-raised)] shadow"
            style={{
              width: plan.canvasWidth,
              height: plan.canvasHeight,
              backgroundImage: snap ? `linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)` : undefined,
              backgroundSize: snap ? `${GRID_SIZE * 2}px ${GRID_SIZE * 2}px` : undefined,
            }}
          >
            {elements.map((element) => {
              const isSelected = selectedIds.includes(element._id);
              return (
                <div
                  key={element._id}
                  onPointerDown={(e) => { e.stopPropagation(); if (!element.locked) begin(e, element, "move"); }}
                  onPointerMove={(e) => move(e, element)}
                  onPointerUp={(e) => end(e)}
                  onClick={(e) => selectElement(e, element._id)}
                  className={`absolute select-none rounded border text-xs font-semibold font-mono ${isSelected ? "z-10 ring-2 ring-[var(--brand)]" : "border-[var(--line-strong)]"} ${element.locked ? "cursor-not-allowed" : "cursor-move"}`}
                  style={{
                    left: element.geometry.x,
                    top: element.geometry.y,
                    width: element.geometry.width,
                    height: element.geometry.height,
                    transform: element.geometry.rotation ? `rotate(${element.geometry.rotation}deg)` : undefined,
                    background: element.type === "STALL" ? "color-mix(in srgb, var(--status-available) 22%, transparent)" : "color-mix(in srgb, var(--status-blocked) 18%, transparent)",
                    borderColor: isSelected ? "var(--brand)" : undefined,
                  }}
                >
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[var(--ink)]">{element.label ?? element.type}</span>
                  {isSelected && !element.locked && (
                    <>
                      <span
                        onPointerDown={(e) => begin(e, element, "resize")}
                        onPointerMove={(e) => move(e, element)}
                        onPointerUp={(e) => end(e)}
                        className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-tl bg-[var(--brand)]"
                      />
                      <span
                        onPointerDown={(e) => begin(e, element, "rotate")}
                        onPointerMove={(e) => move(e, element)}
                        onPointerUp={(e) => end(e)}
                        className="absolute -top-4 left-1/2 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full bg-[var(--brand)]"
                        title="Drag to rotate · hold Shift for free rotation"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <Card className="h-fit p-5">
          <h2 className="font-display font-semibold text-[var(--ink)]">Element properties</h2>
          {selectedIds.length > 1 ? (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">{selectedIds.length} elements selected. Drag to move together, or Delete to remove all.</p>
          ) : selected ? (
            <div className="mt-4 space-y-3">
              <Field label="Label" description="Shown on the stall rectangle and in the inventory picker.">
                <Input
                  value={selected.label ?? ""}
                  onChange={(event) =>
                    setElements((all) =>
                      all.map((x) => (x._id === selected._id ? { ...x, label: event.target.value } : x)),
                    )
                  }
                  onBlur={() => void save(selected, { label: selected.label })}
                />
              </Field>
              <p className="font-mono text-xs text-[var(--ink-soft)]">Position: {Math.round(selected.geometry.x)}, {Math.round(selected.geometry.y)}</p>
              <p className="font-mono text-xs text-[var(--ink-soft)]">Size: {Math.round(selected.geometry.width)} × {Math.round(selected.geometry.height)}</p>
              <p className="font-mono text-xs text-[var(--ink-soft)]">Rotation: {Math.round(selected.geometry.rotation ?? 0)}°</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink-soft)]">Select an element to edit it.</p>
          )}
        </Card>
      </div>
    </main>
  );
}
