import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { badRequest, conflict, serverError, toFieldErrors, unprocessable } from "@/lib/http/responses";
import type { ApiErrorBody } from "@/lib/http/responses";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  geometry: z.object({
    x: z.number().nonnegative("Position cannot be negative."),
    width: z.number().positive("Width must be greater than zero."),
  }),
  amenities: z.array(z.string().min(1, "Amenity cannot be blank.")),
});

function failureOf(input: unknown) {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("expected the schema to reject this input");
  return parsed.error;
}

async function bodyOf(response: Response) {
  return (await response.json()) as ApiErrorBody;
}

describe("toFieldErrors", () => {
  it("keys nested issues by dotted path so a form can target the exact input", () => {
    const { fieldErrors } = toFieldErrors(
      failureOf({ email: "nope", geometry: { x: -1, width: 0 }, amenities: [] }),
    );

    // Zod's own flattenError collapses both of these onto "geometry", which is why the editor
    // could not tell the user whether the position or the size was at fault.
    expect(fieldErrors["geometry.x"]).toEqual(["Position cannot be negative."]);
    expect(fieldErrors["geometry.width"]).toEqual(["Width must be greater than zero."]);
    expect(fieldErrors.email).toEqual(["Enter a valid email address."]);
  });

  it("uses bracket notation for array indices, matching react-hook-form field names", () => {
    const { fieldErrors } = toFieldErrors(
      failureOf({ email: "a@b.co", geometry: { x: 1, width: 1 }, amenities: ["ok", ""] }),
    );

    expect(Object.keys(fieldErrors)).toEqual(["amenities[1]"]);
  });

  it("collects root-level refine failures as form errors, not field errors", () => {
    const refined = z
      .object({ start: z.string(), end: z.string() })
      .refine((value) => value.end >= value.start, "End must not precede start.");
    const parsed = refined.safeParse({ start: "2027-05-02", end: "2027-05-01" });
    if (parsed.success) throw new Error("expected rejection");

    const { fieldErrors, formErrors } = toFieldErrors(parsed.error);
    expect(formErrors).toEqual(["End must not precede start."]);
    expect(fieldErrors).toEqual({});
  });
});

describe("badRequest", () => {
  it("returns 400 with the field errors attached", async () => {
    const response = badRequest(failureOf({ email: "nope", geometry: { x: 1, width: 1 }, amenities: [] }));
    expect(response.status).toBe(400);

    const body = await bodyOf(response);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.fieldErrors?.email).toEqual(["Enter a valid email address."]);
  });

  it("surfaces a single field failure in the summary sentence", async () => {
    const body = await bodyOf(
      badRequest(failureOf({ email: "nope", geometry: { x: 1, width: 1 }, amenities: [] })),
    );
    expect(body.error).toContain("Enter a valid email address.");
  });

  it("prefers a root refine message over the generic fallback", async () => {
    const refined = z
      .object({ start: z.string(), end: z.string() })
      .refine((value) => value.end >= value.start, "End must not precede start.");
    const parsed = refined.safeParse({ start: "2027-05-02", end: "2027-05-01" });
    if (parsed.success) throw new Error("expected rejection");

    const body = await bodyOf(badRequest(parsed.error, "Check the details."));
    expect(body.error).toBe("End must not precede start.");
    expect(body.formErrors).toEqual(["End must not precede start."]);
  });

  it("counts the fields when several are wrong", async () => {
    const body = await bodyOf(
      badRequest(failureOf({ email: "nope", geometry: { x: -1, width: 0 }, amenities: [] }), "Check the details."),
    );
    expect(body.error).toBe("Check the details. Check 3 highlighted fields.");
  });

  it("accepts a plain message for non-Zod rejections", async () => {
    const body = await bodyOf(badRequest("That venue could not be found."));
    expect(body).toEqual({ error: "That venue could not be found.", code: "VALIDATION_FAILED" });
  });
});

describe("conflict and unprocessable", () => {
  it("attaches field errors to a conflict so the offending input is highlighted", async () => {
    const response = conflict("That workspace URL is taken.", "SLUG_TAKEN", { slug: ["Already taken."] });
    expect(response.status).toBe(409);

    const body = await bodyOf(response);
    expect(body.code).toBe("SLUG_TAKEN");
    expect(body.fieldErrors?.slug).toEqual(["Already taken."]);
  });

  it("uses 422 for a state rule rather than reporting it as a race", async () => {
    const response = unprocessable("Booking is not open yet.", "BOOKING_NOT_OPEN");
    expect(response.status).toBe(422);
    expect((await bodyOf(response)).code).toBe("BOOKING_NOT_OPEN");
  });
});

describe("serverError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the cause but never publishes it", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = new Error("MongoServerError: connection <secret-host> refused");

    const response = serverError(cause, "POST /api/test");
    expect(response.status).toBe(500);

    const body = await bodyOf(response);
    expect(body.error).not.toContain("secret-host");
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(logged).toHaveBeenCalledWith("[api] POST /api/test:", cause);
  });
});
