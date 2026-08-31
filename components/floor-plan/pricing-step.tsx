"use client";

import { InventoryTable } from "@/components/stalls/inventory-table";
import type { useFloorPlan } from "@/lib/ui/use-floor-plan";

type PlanApi = ReturnType<typeof useFloorPlan>;

/**
 * Step 3: pricing the inventory.
 *
 * The table itself is shared with the standalone stalls screen and the exhibition detail tab, so
 * repricing behaves identically wherever an organizer happens to be standing.
 */
export function PricingStep({ api, organizationId }: { api: PlanApi; organizationId: string }) {
  return (
    <InventoryTable
      organizationId={organizationId}
      floorPlanId={api.plan?._id ?? null}
      stalls={api.stalls}
      loading={api.loading}
      canManage
      onChanged={async () => {
        await api.reload();
      }}
      title={api.hall ? `${api.hall.name} inventory` : "Stall inventory"}
    />
  );
}
