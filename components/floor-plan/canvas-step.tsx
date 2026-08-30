"use client";

import * as React from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRID_PRESETS, canvasSizeForHall, formatMetres, metresToUnits, unitsToMetres } from "@/lib/floor-plans/units";
import { apiRequest } from "@/lib/http/client";
import { cn } from "@/lib/utils";
import type { useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

/**
 * Step 1: the coordinate space the stalls live in.
 *
 * The width and depth inputs are in metres — the same unit the hall is measured in — and are
 * prefilled from the hall itself. A background image is optional and secondary: requiring one is
 * what made floor-plan creation impossible on a workspace with no object storage, so
 * "Continue without a background" is an equal-weight action here, not a hidden escape.
 */
export function CanvasStep({ api, onContinue }: { api: PlanApi; onContinue: () => void }) {
  const { hall, plan, background } = api;

  const derived = hall ? canvasSizeForHall(hall) : { canvasWidth: 800, canvasHeight: 500 };
  const [widthMetres, setWidthMetres] = React.useState(() =>
    String(unitsToMetres(plan?.canvasWidth ?? derived.canvasWidth)),
  );
  const [depthMetres, setDepthMetres] = React.useState(() =>
    String(unitsToMetres(plan?.canvasHeight ?? derived.canvasHeight)),
  );
  const [gridSize, setGridSize] = React.useState(() => String(plan?.gridSize ?? metresToUnits(1)));
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile(candidate: File | null) {
    setFile(candidate);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return candidate ? URL.createObjectURL(candidate) : null;
    });
  }

  const canvasWidth = metresToUnits(Number(widthMetres) || 0);
  const canvasHeight = metresToUnits(Number(depthMetres) || 0);
  const dimensionsValid = canvasWidth >= 100 && canvasHeight >= 100;

  async function uploadBackground(organizationScopedPath: string) {
    const body = new FormData();
    body.append("file", file!);
    const upload = await apiRequest<{ asset: { _id: string } }>(organizationScopedPath, { method: "POST", body });
    if (!upload.ok) {
      // Explicitly framed as skippable, because the plan itself does not depend on it.
      setError(`${upload.error} You can continue without a background and place stalls on the grid.`);
      return null;
    }
    return upload.data.asset._id;
  }

  async function save() {
    if (!dimensionsValid) {
      setError("Enter a width and depth of at least 5 m.");
      return;
    }
    setBusy(true);
    setError("");

    let backgroundAssetId: string | undefined;
    if (file) {
      const uploaded = await uploadBackground(api.assetsPath);
      if (!uploaded) {
        setBusy(false);
        return;
      }
      backgroundAssetId = uploaded;
    }

    const result = plan
      ? await api.updatePlan({
          canvasWidth,
          canvasHeight,
          gridSize: Number(gridSize),
          ...(backgroundAssetId ? { backgroundAssetId } : {}),
        })
      : await api.ensurePlan({
          canvasWidth,
          canvasHeight,
          gridSize: Number(gridSize),
          ...(backgroundAssetId ? { backgroundAssetId } : {}),
        });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    pickFile(null);
    toast.success(plan ? "Canvas updated." : "Floor plan created.", {
      description: "Next, place the stalls.",
    });
    onContinue();
  }

  async function removeBackground() {
    setBusy(true);
    const result = await api.updatePlan({ backgroundAssetId: null });
    setBusy(false);
    if (!result.ok) toast.error(result.error);
    else toast.success("Background removed.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Canvas</CardTitle>
          <CardDescription>
            The area stalls are placed in, measured the same way as the hall. {hall ? `${hall.name} is recorded as ${hall.width} x ${hall.height} m.` : null}
          </CardDescription>
        </CardHeader>

        <div className="space-y-4 px-6 pb-6">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t save the canvas</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <FieldGroup columns={2}>
            <Field
              label="Width (m)"
              htmlFor="canvas-width"
              description={`${canvasWidth} plan units`}
              required
            >
              <Input
                id="canvas-width"
                value={widthMetres}
                onChange={(event) => setWidthMetres(event.target.value)}
                type="number"
                min="5"
                step="0.5"
                inputMode="decimal"
              />
            </Field>
            <Field label="Depth (m)" htmlFor="canvas-depth" description={`${canvasHeight} plan units`} required>
              <Input
                id="canvas-depth"
                value={depthMetres}
                onChange={(event) => setDepthMetres(event.target.value)}
                type="number"
                min="5"
                step="0.5"
                inputMode="decimal"
              />
            </Field>
          </FieldGroup>

          <Field
            label="Snap grid"
            htmlFor="canvas-grid"
            description="Stalls snap to this pitch while you drag them."
          >
            <Select value={gridSize} onValueChange={setGridSize}>
              <SelectTrigger id="canvas-grid">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRID_PRESETS.map((preset) => (
                  <SelectItem key={preset.units} value={String(preset.units)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Button onClick={() => void save()} loading={busy} size="lg">
            {plan ? "Save and continue" : file ? "Create plan with background" : "Create plan"}
          </Button>
          {!plan && !file && (
            <p className="text-xs text-[var(--ink-faint)]">
              No background needed — you can place stalls straight onto the grid.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Background image</CardTitle>
          <CardDescription>Optional. Trace your existing floor plan instead of measuring by eye.</CardDescription>
        </CardHeader>

        <div className="space-y-3 px-6 pb-6">
          {background && !preview && (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={background.url}
                alt="Current floor-plan background"
                className="max-h-40 w-full rounded-md border border-[var(--line)] object-contain"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-[var(--ink-faint)]">{background.filename}</span>
                <Button size="sm" variant="ghost" onClick={() => void removeBackground()} disabled={busy}>
                  <Trash2 aria-hidden />
                  Remove
                </Button>
              </div>
            </div>
          )}

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) pickFile(dropped);
            }}
            className={cn(
              "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm",
              dragging
                ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]"
                : "border-[var(--line-strong)]",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="New background preview" className="max-h-32 rounded-md object-contain" />
            ) : (
              <>
                <ImageUp className="size-5 text-[var(--ink-faint)]" aria-hidden />
                <span className="text-[var(--ink-soft)]">Drop an image, or choose a file</span>
              </>
            )}
            <span className="font-mono text-[11px] text-[var(--ink-faint)]">
              {file ? file.name : "PNG, JPEG, WebP or SVG · up to 15 MB"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="w-full text-xs"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <Button size="sm" variant="ghost" onClick={() => pickFile(null)}>
              Clear selection
            </Button>
          )}

          <p className="text-xs text-[var(--ink-faint)]">
            {api.storageDriver === "r2" ? "Stored in Cloudflare R2." : "Stored on this server."} The image is stretched
            to fill the {formatMetres(canvasWidth, { withUnit: false })} x{" "}
            {formatMetres(canvasHeight, { withUnit: false })} m canvas, so use one with the same proportions.
          </p>
        </div>
      </Card>
    </div>
  );
}
