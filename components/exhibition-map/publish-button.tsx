"use client";
import { useState } from "react";

export function PublishMapButton({ organizationId, floorPlanId }: { organizationId: string; floorPlanId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  async function publish() {
    setState("saving"); setMessage("");
    try {
      const response = await fetch(`/api/organizations/${organizationId}/floor-plans/${floorPlanId}/publish`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to publish floor plan");
      setState("done"); setMessage("Published");
    } catch (error) {
      setState("error"); setMessage(error instanceof Error ? error.message : "Unable to publish floor plan");
    }
  }
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => void publish()} disabled={state === "saving" || state === "done"} className="rounded-md bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-[var(--brand-ink)] disabled:opacity-60">
        {state === "saving" ? "Publishing…" : state === "done" ? "Published ✓" : "Publish map"}
      </button>
      {message && <span role={state === "error" ? "alert" : "status"} className={`max-w-xs text-xs ${state === "error" ? "text-[var(--status-booked)]" : "text-[var(--status-available)]"}`}>{message}</span>}
    </div>
  );
}
