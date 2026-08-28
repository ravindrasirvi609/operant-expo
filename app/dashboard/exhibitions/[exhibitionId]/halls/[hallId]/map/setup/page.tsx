"use client";
import { useEffect, useState } from "react";

import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { DimensionDivider } from "@/components/ui/dimension-divider";

export default function SetupPage({ params, searchParams }: { params: Promise<{ exhibitionId: string; hallId: string }>; searchParams: Promise<{ organizationId?: string }> }) {
  const [ids, setIds] = useState<{ exhibitionId: string; hallId: string; organizationId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "creating" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => { void Promise.all([params, searchParams]).then(([route, query]) => setIds({ ...route, organizationId: query.organizationId ?? "" })); }, [params, searchParams]);

  function pickFile(candidate: File | null) {
    setFile(candidate);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(candidate ? URL.createObjectURL(candidate) : null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ids?.organizationId || !file) return;
    const form = new FormData(event.currentTarget);
    try {
      setPhase("uploading");
      setMessage("Uploading floor plan to Cloudflare R2…");
      const upload = new FormData();
      upload.append("file", file);
      const assetResponse = await fetch(`/api/organizations/${ids.organizationId}/assets`, { method: "POST", body: upload });
      const asset = await assetResponse.json();
      if (!assetResponse.ok) throw new Error(asset.error);

      setPhase("creating");
      setMessage("Creating floor plan draft…");
      const response = await fetch(`/api/organizations/${ids.organizationId}/exhibitions/${ids.exhibitionId}/halls/${ids.hallId}/floor-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasWidth: Number(form.get("canvasWidth")), canvasHeight: Number(form.get("canvasHeight")), backgroundAssetId: asset.asset._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPhase("done");
      setMessage(`Floor plan version ${data.floorPlan.version} created. Add stalls next in the map editor.`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Unable to create floor plan");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <SectionEyebrow>Floor-plan setup</SectionEyebrow>
      <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--ink)]">Create a hall map</h1>
      <p className="mt-3 text-[var(--ink-soft)]">Upload your floor plan and define its logical canvas size — the coordinate space every stall will be placed in.</p>
      <DimensionDivider className="mt-6" />

      {message && (
        <p role={phase === "error" ? "alert" : "status"} className={`mt-5 rounded-md border p-3 text-sm ${phase === "error" ? "border-[var(--booked)] bg-[color-mix(in_srgb,var(--booked)_10%,transparent)] text-[var(--booked)]" : phase === "done" ? "border-[var(--available)] bg-[color-mix(in_srgb,var(--available)_10%,transparent)] text-[var(--available)]" : "border-[var(--line)] bg-[var(--paper)] text-[var(--ink-soft)]"}`}>
          {message}
        </p>
      )}

      <form onSubmit={submit} className="corner-marks mt-6 space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--paper-raised)] p-6 shadow-sm">
        <label
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files?.[0]; if (dropped) pickFile(dropped); }}
          className={`flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors ${dragging ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-[var(--line-strong)]"}`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Floor-plan preview" className="max-h-40 rounded-md border border-[var(--line)] object-contain" />
          ) : (
            <span className="text-[var(--ink-soft)]">Drag a floor-plan image or SVG here, or choose a file</span>
          )}
          <span className="font-mono text-xs text-[var(--ink-faint)]">{file ? file.name : "PNG, JPEG, WebP or SVG · up to 15 MB"}</span>
          <input name="file" required type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="w-full text-sm" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm text-[var(--ink)]">
            Canvas width
            <input name="canvasWidth" required type="number" min="100" defaultValue="1600" className="mt-1 w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3 font-mono" />
          </label>
          <label className="text-sm text-[var(--ink)]">
            Canvas height
            <input name="canvasHeight" required type="number" min="100" defaultValue="2200" className="mt-1 w-full rounded-md border border-[var(--line-strong)] bg-transparent p-3 font-mono" />
          </label>
        </div>

        <button disabled={!ids?.organizationId || !file || phase === "uploading" || phase === "creating"} className="w-full rounded-md bg-[var(--accent)] p-3 font-medium text-[var(--accent-ink)] disabled:opacity-50">
          {phase === "uploading" ? "Uploading…" : phase === "creating" ? "Creating floor plan…" : "Create floor plan"}
        </button>
      </form>
    </main>
  );
}
