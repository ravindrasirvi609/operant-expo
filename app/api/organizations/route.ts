import { MongoServerError, ObjectId } from "mongodb";

import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { writeAudit } from "@/lib/audit";
import { readBody } from "@/lib/http/body";
import { badRequest, conflict, created, serverError, unauthorizedJson } from "@/lib/http/responses";
import { organizationSchema } from "@/lib/validation/organization";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?._id) return unauthorizedJson();

    // Previously validated with a hand-rolled `body.name?.trim() && body.slug?.match(...)` check
    // that returned one opaque sentence for either failure. Same Zod schema as the form now.
    const parsed = organizationSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the organization details.");

    const database = await getDatabase();
    const now = new Date();
    const organizationId = new ObjectId();

    const organization: OrganizationDocument = {
      _id: organizationId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    const membership: MembershipDocument = {
      _id: new ObjectId(),
      organizationId,
      userId: user._id,
      role: "OWNER",
      scopes: ["*"],
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await withTransaction(database, async (session) => {
        await database.collection<OrganizationDocument>("organizations").insertOne(organization, { session });
        await database.collection<MembershipDocument>("memberships").insertOne(membership, { session });
        await writeAudit(
          database,
          {
            organizationId,
            actorId: user._id,
            action: "organization.created",
            entityType: "Organization",
            entityId: organizationId.toString(),
            after: { name: organization.name, slug: organization.slug },
          },
          session,
        );
      });
    } catch (cause) {
      // The old handler caught everything here and always blamed the slug, so a transaction or
      // connection failure was reported to the user as "slug already exists".
      if (cause instanceof MongoServerError && cause.code === 11000) {
        return conflict("That workspace URL is already taken. Try another.", "SLUG_TAKEN", {
          slug: ["That workspace URL is already taken."],
        });
      }
      throw cause;
    }

    return created({
      organization: {
        _id: organizationId.toString(),
        name: organization.name,
        slug: organization.slug,
      },
    });
  } catch (cause) {
    return serverError(cause, "POST /api/organizations");
  }
}
