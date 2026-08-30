"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { EmbedCodePanel } from "@/components/dashboard/embed-code-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/http/client";
import { cn } from "@/lib/utils";
import type { Exhibition } from "@/components/exhibitions/create-exhibition-form";

/**
 * The lifecycle step offered from each state, and what it means for visitors.
 *
 * PUBLISHED makes the map visible but leaves booking shut, which is exactly the state that made
 * the public flow look broken: a visitor could click a stall and be told "not available" with no
 * explanation. So the published card says plainly that booking is still closed and offers the
 * one action that opens it.
 */
const NEXT_STEP: Record<string, { target: string; label: string; note: string; variant?: "default" | "outline" }> = {
  DRAFT: {
    target: "PUBLISHED",
    label: "Publish exhibition",
    note: "Not visible to anyone yet. Needs at least one active hall.",
  },
  PUBLISHED: {
    target: "BOOKING_OPEN",
    label: "Open booking",
    note: "Visible to visitors, but booking is closed — stalls cannot be reserved yet.",
  },
  BOOKING_OPEN: {
    target: "BOOKING_CLOSED",
    label: "Close booking",
    note: "Visitors can reserve and book stalls right now.",
    variant: "outline",
  },
  BOOKING_CLOSED: {
    target: "BOOKING_OPEN",
    label: "Reopen booking",
    note: "Map is visible, but no new bookings are accepted.",
  },
};

const PUBLIC_LIFECYCLES = new Set(["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"]);

export function ExhibitionCard({
  exhibition,
  organizationId,
  selected,
  canManage,
  onSelect,
  onUpdated,
}: {
  exhibition: Exhibition;
  organizationId: string;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onUpdated: (exhibition: Exhibition) => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const step = NEXT_STEP[exhibition.lifecycle];
  const isPublic = PUBLIC_LIFECYCLES.has(exhibition.lifecycle);

  async function changeLifecycle(target: string, label: string) {
    setSaving(true);
    const result = await apiRequest<{ exhibition: Exhibition }>(
      `/api/organizations/${organizationId}/exhibitions/${exhibition._id}/lifecycle`,
      { method: "POST", json: { lifecycle: target } },
    );
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onUpdated(result.data.exhibition);
    toast.success(`${exhibition.name}: ${label.toLowerCase()} done.`, {
      description:
        target === "BOOKING_OPEN"
          ? "Visitors can now reserve stalls on published floor plans."
          : target === "PUBLISHED"
            ? "The public page is live. Open booking when you are ready to take reservations."
            : undefined,
    });
  }

  return (
    <Card
      data-active={selected}
      className={cn("corner-marks p-5", selected ? "border-[var(--brand)]" : "border-[var(--line)]")}
    >
      <button onClick={onSelect} className="w-full text-left" aria-expanded={selected}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-[var(--ink)]">{exhibition.name}</h3>
            <p className="mt-0.5 truncate font-mono text-sm text-[var(--ink-soft)]">/{exhibition.slug}</p>
          </div>
          <StatusBadge status={exhibition.lifecycle} />
        </div>
        <p className="mt-3 font-mono text-sm text-[var(--ink-soft)]">
          {new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}
        </p>
      </button>

      {step && <p className="mt-3 text-xs text-[var(--ink-faint)]">{step.note}</p>}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
        {step && canManage && (
          <Button
            size="sm"
            variant={step.variant ?? "default"}
            loading={saving}
            onClick={() => void changeLifecycle(step.target, step.label)}
          >
            {step.label}
          </Button>
        )}
        {isPublic && (
          <Button asChild size="sm" variant="outline">
            <a href={`/exhibitions/${exhibition.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              View public page
            </a>
          </Button>
        )}
      </div>

      {isPublic && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <EmbedCodePanel slug={exhibition.slug} name={exhibition.name} />
        </div>
      )}
    </Card>
  );
}
