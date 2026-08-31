"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest } from "@/lib/http/client";
import type { Exhibition } from "@/components/exhibitions/create-exhibition-form";

/**
 * The one lifecycle step offered from each state, with what it means for visitors.
 *
 * PUBLISHED spells out that booking is still shut, because that is the state which made the public
 * flow look broken: a visitor could see the map, click a stall, and be told it was unavailable.
 */
const NEXT_STEP: Record<string, { target: string; label: string; note: string; variant?: "default" | "outline" }> = {
  DRAFT: {
    target: "PUBLISHED",
    label: "Publish",
    note: "Not visible to anyone yet. Needs at least one active hall.",
  },
  PUBLISHED: {
    target: "BOOKING_OPEN",
    label: "Open booking",
    note: "Visible to visitors, but stalls cannot be reserved yet.",
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
    note: "The map is visible, but no new bookings are accepted.",
  },
};

const PUBLIC_LIFECYCLES = new Set(["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"]);

/**
 * One exhibition in the list.
 *
 * The whole card is a link to the exhibition's own page. It used to expand a hall-management panel
 * beneath itself instead, which meant the list grew into a workspace and halls, stalls and sharing
 * had nowhere of their own to live.
 */
export function ExhibitionCard({
  exhibition,
  organizationId,
  canManage,
  onUpdated,
}: {
  exhibition: Exhibition;
  organizationId: string;
  canManage: boolean;
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
    <Card className="corner-marks">
      <Link
        href={`/dashboard/exhibitions/${exhibition._id}`}
        className="block rounded-t-xl p-5 transition-colors hover:bg-[color-mix(in_srgb,var(--paper-sunken)_60%,transparent)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 font-display text-lg font-semibold text-[var(--ink)]">
              {exhibition.name}
              <ChevronRight className="size-4 text-[var(--ink-faint)]" aria-hidden />
            </h3>
            <p className="mt-0.5 truncate font-mono text-sm text-[var(--ink-soft)]">/{exhibition.slug}</p>
          </div>
          <StatusBadge status={exhibition.lifecycle} />
        </div>
        <p className="mt-3 font-mono text-sm text-[var(--ink-soft)]">
          {new Date(exhibition.startDate).toLocaleDateString()} – {new Date(exhibition.endDate).toLocaleDateString()}
        </p>
        {step && <p className="mt-2 text-xs text-[var(--ink-faint)]">{step.note}</p>}
      </Link>

      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-5 py-4">
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
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/exhibitions/${exhibition._id}`}>Manage</Link>
        </Button>
        {isPublic && (
          <Button asChild size="sm" variant="ghost">
            <a href={`/exhibitions/${exhibition.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              Public page
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
