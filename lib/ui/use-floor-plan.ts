"use client";

import * as React from "react";

import { apiGet, apiRequest, type ApiFailure } from "@/lib/http/client";
import type { Rect } from "@/lib/floor-plans/geometry";

export type PlanElement = {
  _id: string;
  type: "STALL" | "ENTRANCE" | "EXIT" | "ZONE" | "STAGE" | "WALKWAY";
  geometry: Rect & { type: "rect" };
  label?: string;
  locked: boolean;
  visible: boolean;
  zIndex: number;
};

export type PlanStall = {
  _id: string;
  floorPlanElementId: string;
  stallNumber: string;
  section?: string;
  stallType: string;
  width: number;
  height: number;
  area: number;
  basePrice: number;
  currency: string;
  status: string;
  visibility: string;
  amenities: string[];
  description?: string;
};

export type FloorPlan = {
  _id: string;
  canvasWidth: number;
  canvasHeight: number;
  gridSize: number;
  revision: number;
  status: "DRAFT" | "PUBLISHED";
  publishedAt?: string;
  backgroundAssetId?: string;
};

export type ReadinessCheck = { id: string; label: string; ok: boolean; detail?: string };

export type PlanHall = { _id: string; name: string; code: string; width: number; height: number };

export type PlanPayload = {
  hall: PlanHall;
  floorPlan: FloorPlan | null;
  elements: PlanElement[];
  stalls: PlanStall[];
  background: { url: string; filename: string } | null;
  readiness: ReadinessCheck[];
  storage: { driver: "r2" | "local" };
};

export type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * All floor-plan reads and writes for the wizard.
 *
 * Everything the editor needs arrives in one request, including which rectangles already have a
 * bookable stall behind them — the previous editor could not know that, because stalls were fetched
 * by hall while elements came from a specific plan version.
 *
 * Geometry is applied locally first so dragging stays smooth, then persisted; `saveState` is what
 * the toolbar reports, so a failed save is visible rather than silent.
 */
export function useFloorPlan({
  organizationId,
  exhibitionId,
  hallId,
}: {
  organizationId: string;
  exhibitionId: string;
  hallId: string;
}) {
  // Screens that cascade their selections (organization, then exhibition, then hall) mount this
  // hook before every id is known. Without this guard it requested a path with empty segments,
  // which normalises to a route that does not exist — three wasted 404s and console noise per load.
  const ready = Boolean(organizationId && exhibitionId && hallId);
  const planPath = ready
    ? `/api/organizations/${organizationId}/exhibitions/${exhibitionId}/halls/${hallId}/floor-plan`
    : "";
  const assetsPath = `/api/organizations/${organizationId}/assets`;

  const [payload, setPayload] = React.useState<PlanPayload | null>(null);
  const [loadError, setLoadError] = React.useState("");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [saveError, setSaveError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!planPath) return { ok: false as const, status: 0, error: "No hall selected." };
    const result = await apiGet<PlanPayload>(planPath);
    if (result.ok) {
      setPayload(result.data);
      setLoadError("");
    } else {
      setLoadError(result.error);
    }
    return result;
  }, [planPath]);

  React.useEffect(() => {
    if (!planPath) return;
    let cancelled = false;
    void apiGet<PlanPayload>(planPath).then((result) => {
      if (cancelled) return;
      if (result.ok) setPayload(result.data);
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [planPath]);

  /** Wraps a write so every caller reports progress the same way. */
  const track = React.useCallback(async <T,>(work: () => Promise<{ ok: true; data: T } | ApiFailure>) => {
    setSaveState("saving");
    setSaveError("");
    const result = await work();
    if (result.ok) {
      setSaveState("saved");
    } else {
      setSaveState("failed");
      setSaveError(result.error);
    }
    return result;
  }, []);

  const plan = payload?.floorPlan ?? null;
  const stallsPath = plan ? `/api/organizations/${organizationId}/floor-plans/${plan._id}/stalls` : "";

  const ensurePlan = React.useCallback(
    async (input: { canvasWidth?: number; canvasHeight?: number; gridSize?: number; backgroundAssetId?: string } = {}) => {
      const result = await track(() =>
        apiRequest<{ floorPlan: FloorPlan }>(planPath, { method: "POST", json: input }),
      );
      if (result.ok) await load();
      return result;
    },
    [planPath, track, load],
  );

  const updatePlan = React.useCallback(
    async (patch: Partial<Pick<FloorPlan, "canvasWidth" | "canvasHeight" | "gridSize">> & { backgroundAssetId?: string | null }) => {
      const result = await track(() => apiRequest<{ floorPlan: FloorPlan }>(planPath, { method: "PATCH", json: patch }));
      if (result.ok) await load();
      return result;
    },
    [planPath, track, load],
  );

  const createStall = React.useCallback(
    async (input: Record<string, unknown>) => {
      const result = await track(() =>
        apiRequest<{ stall: PlanStall; element: PlanElement }>(stallsPath, { method: "POST", json: input }),
      );
      if (result.ok) {
        setPayload((current) =>
          current
            ? {
                ...current,
                stalls: [...current.stalls, result.data.stall],
                elements: [...current.elements, result.data.element],
              }
            : current,
        );
      }
      return result;
    },
    [stallsPath, track],
  );

  const updateStall = React.useCallback(
    async (stallId: string, patch: Record<string, unknown>) => {
      const result = await track(() =>
        apiRequest<{ stall: PlanStall; element: PlanElement }>(`${stallsPath}/${stallId}`, {
          method: "PATCH",
          json: patch,
        }),
      );
      if (result.ok) {
        setPayload((current) =>
          current
            ? {
                ...current,
                stalls: current.stalls.map((stall) => (stall._id === stallId ? result.data.stall : stall)),
                elements: current.elements.map((element) =>
                  element._id === result.data.element._id ? result.data.element : element,
                ),
              }
            : current,
        );
      }
      return result;
    },
    [stallsPath, track],
  );

  const deleteStall = React.useCallback(
    async (stallId: string) => {
      const stall = payload?.stalls.find((candidate) => candidate._id === stallId);
      const result = await track(() =>
        apiRequest<{ deleted: boolean }>(`${stallsPath}/${stallId}`, { method: "DELETE" }),
      );
      if (result.ok && stall) {
        setPayload((current) =>
          current
            ? {
                ...current,
                stalls: current.stalls.filter((candidate) => candidate._id !== stallId),
                elements: current.elements.filter((element) => element._id !== stall.floorPlanElementId),
              }
            : current,
        );
      }
      return result;
    },
    [stallsPath, track, payload],
  );

  const createGrid = React.useCallback(
    async (request: Record<string, unknown>) => {
      const result = await track(() =>
        apiRequest<{ count: number }>(`${stallsPath}/bulk`, { method: "POST", json: request }),
      );
      // A grid can add hundreds of records; re-reading is cheaper to reason about than merging.
      if (result.ok) await load();
      return result;
    },
    [stallsPath, track, load],
  );

  const createElement = React.useCallback(
    async (input: Record<string, unknown>) => {
      if (!plan) return { ok: false as const, status: 0, error: "No floor plan yet." };
      const result = await track(() =>
        apiRequest<{ element: PlanElement }>(
          `/api/organizations/${organizationId}/floor-plans/${plan._id}/elements`,
          { method: "POST", json: input },
        ),
      );
      if (result.ok) {
        setPayload((current) =>
          current ? { ...current, elements: [...current.elements, result.data.element] } : current,
        );
      }
      return result;
    },
    [organizationId, plan, track],
  );

  const publish = React.useCallback(async () => {
    if (!plan) return { ok: false as const, status: 0, error: "No floor plan yet." };
    const result = await track(() =>
      apiRequest<{ floorPlan: FloorPlan; readiness: ReadinessCheck[] }>(
        `/api/organizations/${organizationId}/floor-plans/${plan._id}/publish`,
        { method: "POST" },
      ),
    );
    if (result.ok) await load();
    return result;
  }, [organizationId, plan, track, load]);

  /** Applies geometry locally for a smooth drag, without touching the server. */
  const applyLocalGeometry = React.useCallback((elementId: string, geometry: PlanElement["geometry"]) => {
    setPayload((current) =>
      current
        ? {
            ...current,
            elements: current.elements.map((element) =>
              element._id === elementId ? { ...element, geometry } : element,
            ),
          }
        : current,
    );
  }, []);

  const stallByElementId = React.useMemo(() => {
    const map = new Map<string, PlanStall>();
    for (const stall of payload?.stalls ?? []) map.set(stall.floorPlanElementId, stall);
    return map;
  }, [payload]);

  return {
    payload,
    plan,
    hall: payload?.hall ?? null,
    elements: payload?.elements ?? [],
    stalls: payload?.stalls ?? [],
    background: payload?.background ?? null,
    readiness: payload?.readiness ?? [],
    assetsPath,
    storageDriver: payload?.storage?.driver ?? "local",
    stallByElementId,
    // Nothing is loading when there is nothing to load, so a screen with no hall chosen renders its
    // empty state rather than an endless skeleton.
    loading: ready && payload === null && loadError === "",
    loadError,
    saveState,
    saveError,
    reload: load,
    ensurePlan,
    updatePlan,
    createStall,
    updateStall,
    deleteStall,
    createGrid,
    createElement,
    publish,
    applyLocalGeometry,
  };
}
