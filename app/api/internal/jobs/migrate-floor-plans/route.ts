import { getDatabase } from "@/lib/db/client";
import { migrateToSingleFloorPlan, migrationIsBlocked } from "@/lib/db/migrations/single-floor-plan";
import { readBody } from "@/lib/http/body";
import { ok, serverError, unauthorizedJson } from "@/lib/http/responses";

/**
 * Runs the single-floor-plan migration.
 *
 * Dry run by default — post `{ "apply": true }` to write. Guarded by the same shared secret as the
 * other internal jobs, because it rewrites plan and element ownership.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) {
      return unauthorizedJson("This endpoint requires a valid x-job-secret header.");
    }

    const body = (await readBody(request).catch(() => ({}))) as { apply?: boolean };
    const apply = body.apply === true;

    const database = await getDatabase();
    const report = await migrateToSingleFloorPlan(database, { apply });

    return ok({
      ...report,
      // Naming the blocker is the whole point of the dry run: the operator has to choose which
      // stall keeps a contested element before the unique index can exist.
      blocked: migrationIsBlocked(report),
      nextStep: apply
        ? migrationIsBlocked(report)
          ? "Resolve the duplicate element references listed in warnings, then restart the app so the unique indexes can be created."
          : "Restart the app so the unique indexes are created."
        : 'Review the actions above, then re-post with {"apply": true}.',
    });
  } catch (cause) {
    return serverError(cause, "POST /api/internal/jobs/migrate-floor-plans");
  }
}
