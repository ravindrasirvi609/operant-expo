"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUp, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DimensionDivider } from "@/components/ui/dimension-divider";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { apiRequest } from "@/lib/http/client";
import { cn } from "@/lib/utils";

type Ids = { exhibitionId: string; hallId: string; organizationId: string };

export default function FloorPlanSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ exhibitionId: string; hallId: string }>;
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const router = useRouter();
  const [ids, setIds] = React.useState<Ids | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [phase, setPhase] = React.useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = React.useState("");
  const [canvasWidth, setCanvasWidth] = React.useState("800");
  const [canvasHeight, setCanvasHeight] = React.useState("500");

  React.useEffect(() => {
    void Promise.all([params, searchParams]).then(([route, query]) =>
      setIds({ ...route, organizationId: query.organizationId ?? "" }),
    );
  }, [params, searchParams]);

  // Revoke the previous object URL whenever the selection changes, and on unmount, so repeated
  // picking does not leak blobs.
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

  const busy = phase !== "idle";
  const editorHref = ids
    ? `/dashboard/exhibitions/${ids.exhibitionId}/halls/${ids.hallId}/map/edit?organizationId=${ids.organizationId}`
    : "";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ids?.organizationId) return;
    setError("");

    let backgroundAssetId: string | undefined;

    // A background is optional. It is uploaded first only when one was chosen, so a workspace
    // with no object storage configured can still create a plan and place stalls on the grid.
    if (file) {
      setPhase("uploading");
      const body = new FormData();
      body.append("file", file);

      const upload = await apiRequest<{ asset: { _id: string } }>(
        `/api/organizations/${ids.organizationId}/assets`,
        { method: "POST", body },
      );

      if (!upload.ok) {
        setPhase("idle");
        setError(
          `${upload.error} You can continue without a background image and place stalls on the grid instead.`,
        );
        return;
      }
      backgroundAssetId = upload.data.asset._id;
    }

    setPhase("creating");
    const result = await apiRequest<{ floorPlan: { _id: string; version: number } }>(
      `/api/organizations/${ids.organizationId}/exhibitions/${ids.exhibitionId}/halls/${ids.hallId}/floor-plans`,
      {
        method: "POST",
        json: {
          canvasWidth: Number(canvasWidth),
          canvasHeight: Number(canvasHeight),
          ...(backgroundAssetId ? { backgroundAssetId } : {}),
        },
      },
    );
    setPhase("idle");

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success(`Floor plan created (version ${result.data.floorPlan.version}).`, {
      description: "Next, place and price the stalls.",
    });
    router.push(editorHref);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SectionEyebrow>Floor-plan setup</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Create a hall map</h1>
      <p className="mt-3 text-[var(--ink-soft)]">
        Set the coordinate space stalls are placed in. A background image is optional — you can trace over one, or
        place stalls directly on the grid.
      </p>
      <DimensionDivider className="mt-6" />

      {ids && !ids.organizationId && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Missing organization</AlertTitle>
          <AlertDescription>
            Open this page from the exhibition it belongs to so it knows which workspace to save into.
            <span className="mt-3 block">
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/exhibitions">Go to exhibitions</Link>
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn&apos;t create the floor plan</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="corner-marks mt-6 p-6">
        <form onSubmit={submit} className="space-y-4">
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
              "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors",
              dragging ? "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]" : "border-[var(--line-strong)]",
            )}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Floor-plan preview"
                className="max-h-40 rounded-md border border-[var(--line)] object-contain"
              />
            ) : (
              <>
                <ImageUp className="size-6 text-[var(--ink-faint)]" aria-hidden />
                <span className="text-[var(--ink-soft)]">Drag a floor-plan image here, or choose a file</span>
              </>
            )}
            <span className="font-mono text-xs text-[var(--ink-faint)]">
              {file ? file.name : "Optional · PNG, JPEG, WebP or SVG · up to 15 MB"}
            </span>
            <input
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="w-full text-sm"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {file && (
            <Button type="button" variant="ghost" size="sm" onClick={() => pickFile(null)}>
              Remove background
            </Button>
          )}

          <FieldGroup columns={2}>
            <Field
              label="Canvas width"
              description="Plan units. 20 units = 1 metre."
              htmlFor="canvas-width"
              required
            >
              <Input
                id="canvas-width"
                value={canvasWidth}
                onChange={(event) => setCanvasWidth(event.target.value)}
                type="number"
                min="100"
                step="10"
                inputMode="numeric"
              />
            </Field>
            <Field label="Canvas height" htmlFor="canvas-height" required>
              <Input
                id="canvas-height"
                value={canvasHeight}
                onChange={(event) => setCanvasHeight(event.target.value)}
                type="number"
                min="100"
                step="10"
                inputMode="numeric"
              />
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="flex-1" loading={busy} disabled={!ids?.organizationId}>
              <LayoutTemplate aria-hidden />
              {phase === "uploading"
                ? "Uploading background…"
                : phase === "creating"
                  ? "Creating floor plan…"
                  : file
                    ? "Create floor plan with background"
                    : "Create floor plan"}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
