"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/http/client";

export function PublishMapButton({
  organizationId,
  floorPlanId,
}: {
  organizationId: string;
  floorPlanId: string;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = React.useState(false);
  const [published, setPublished] = React.useState(false);

  async function publish() {
    setPublishing(true);
    const result = await apiRequest(
      `/api/organizations/${organizationId}/floor-plans/${floorPlanId}/publish`,
      { method: "POST" },
    );
    setPublishing(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setPublished(true);
    toast.success("Floor plan published.", {
      description: "Visitors will see this layout once booking is open.",
    });
    // The server-rendered page shows the plan status, so refresh rather than leaving it stale.
    router.refresh();
  }

  return (
    <Button onClick={() => void publish()} loading={publishing} disabled={published}>
      {published ? <Check aria-hidden /> : <Upload aria-hidden />}
      {published ? "Published" : "Publish map"}
    </Button>
  );
}
