import { ObjectId, type Db } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import type { OrganizationContext } from "@/lib/auth/tenant";
import { getDatabase } from "@/lib/db/client";
import { FloorPlanError } from "@/lib/floor-plans/service";
import { conflict, notFoundJson, serverError, unprocessable } from "@/lib/http/responses";
import type { FloorPlanDocument } from "@/models/map";

export type PlanContext = {
  database: Db;
  organizationId: ObjectId;
  plan: FloorPlanDocument;
  context: OrganizationContext;
};

/**
 * Loads a floor plan for a route, after checking permission and tenant ownership.
 *
 * Returns a `Response` on any failure so the caller can `if ("response" in loaded) return …`,
 * keeping the five stall/element routes free of repeated guard boilerplate.
 */
export async function loadPlan(
  organizationId: string,
  floorPlanId: string,
  permission: string,
): Promise<PlanContext | { response: Response }> {
  const auth = await requireApiPermission(organizationId, permission);
  if (!auth.ok) return { response: auth.response };

  if (!ObjectId.isValid(floorPlanId)) {
    return { response: notFoundJson("That floor plan could not be found.") };
  }

  const database = await getDatabase();
  const organizationObjectId = new ObjectId(organizationId);
  const plan = await database
    .collection<FloorPlanDocument>("floorPlans")
    .findOne({ _id: new ObjectId(floorPlanId), organizationId: organizationObjectId });

  if (!plan) return { response: notFoundJson("That floor plan could not be found.") };

  return { database, organizationId: organizationObjectId, plan, context: auth.context };
}

/**
 * Turns a service-layer failure into its intended HTTP response.
 *
 * FloorPlanError carries the status, code and any field errors it wants; anything else is genuinely
 * unexpected and goes through serverError, which logs it and publishes nothing.
 */
export function floorPlanErrorResponse(cause: unknown, routeLabel: string) {
  if (cause instanceof FloorPlanError) {
    if (cause.status === 404) return notFoundJson(cause.message);
    if (cause.status === 422) return unprocessable(cause.message, cause.code);
    if (cause.status === 400) {
      // Reuse the validation shape so a geometry complaint lands on the right control.
      return Response.json(
        { error: cause.message, code: cause.code, ...(cause.fieldErrors ? { fieldErrors: cause.fieldErrors } : {}) },
        { status: 400 },
      );
    }
    return conflict(cause.message, cause.code, cause.fieldErrors);
  }
  return serverError(cause, routeLabel);
}
