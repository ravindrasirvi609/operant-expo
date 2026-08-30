import { describe, expect, it } from "vitest";

import { exhibitionCreateSchema, exhibitionUpdateSchema, hallSchema } from "@/lib/validation/exhibition";

const base = {
  name: "Spring Trade Expo",
  slug: "spring-trade-expo",
  timezone: "Asia/Kolkata",
  startDate: "2027-05-01",
  endDate: "2027-05-04",
};

describe("exhibitionCreateSchema", () => {
  it("accepts a well-formed exhibition and defaults booking to disabled", () => {
    const parsed = exhibitionCreateSchema.parse(base);
    expect(parsed.bookingMode).toBe("DISABLED");
    expect(parsed.startDate).toBe("2027-05-01");
  });

  it("reports an end date before the start date against the endDate field", () => {
    // The message existed before but the client discarded it, so the user saw "Request failed".
    const parsed = exhibitionCreateSchema.safeParse({ ...base, endDate: "2027-04-30" });
    if (parsed.success) throw new Error("expected rejection");

    const issue = parsed.error.issues[0];
    expect(issue.path).toEqual(["endDate"]);
    expect(issue.message).toBe("The end date must be on or after the start date.");
  });

  it("allows a single-day exhibition", () => {
    expect(exhibitionCreateSchema.safeParse({ ...base, endDate: base.startDate }).success).toBe(true);
  });

  it("keeps dates as ISO strings so one schema can serve the form and the route", () => {
    // z.coerce.date() has an `unknown` input type, which is unusable as a form schema — that gap
    // is why the form and the route used to validate different rules.
    expect(typeof exhibitionCreateSchema.parse(base).startDate).toBe("string");
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expect(exhibitionCreateSchema.safeParse({ ...base, startDate: "01/05/2027" }).success).toBe(false);
  });

  it("rejects a calendar date that does not exist", () => {
    expect(exhibitionCreateSchema.safeParse({ ...base, startDate: "2027-02-31" }).success).toBe(false);
  });

  it("treats an empty venue selection as no venue", () => {
    expect(exhibitionCreateSchema.parse({ ...base, venueId: "" }).venueId).toBeUndefined();
  });
});

describe("exhibitionUpdateSchema", () => {
  it("allows a partial patch that omits both dates", () => {
    expect(exhibitionUpdateSchema.safeParse({ name: "Renamed" }).success).toBe(true);
  });

  it("still enforces date ordering when both dates are supplied", () => {
    expect(
      exhibitionUpdateSchema.safeParse({ startDate: "2027-05-02", endDate: "2027-05-01" }).success,
    ).toBe(false);
  });

  it("does not reject a patch that supplies only one date", () => {
    // The stored counterpart is compared in the route, which is the only place that knows it.
    expect(exhibitionUpdateSchema.safeParse({ endDate: "2027-05-01" }).success).toBe(true);
  });
});

describe("hallSchema", () => {
  const hall = { name: "Hall A", code: "HALL-A", width: "40", height: "25" };

  it("coerces the dimension strings a number input produces", () => {
    const parsed = hallSchema.parse(hall);
    expect(parsed.width).toBe(40);
    expect(parsed.height).toBe(25);
    expect(parsed.publicVisibility).toBe(true);
  });

  it("explains why a code with a space is rejected", () => {
    const parsed = hallSchema.safeParse({ ...hall, code: "HALL A" });
    if (parsed.success) throw new Error("expected rejection");
    expect(parsed.error.issues[0].message).toContain("no spaces");
  });

  it("rejects a non-positive dimension", () => {
    expect(hallSchema.safeParse({ ...hall, width: "0" }).success).toBe(false);
  });
});
