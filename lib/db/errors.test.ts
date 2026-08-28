import { describe, expect, it } from "vitest";
import { MongoServerError } from "mongodb";
import { isDuplicateKeyError } from "@/lib/db/errors";

describe("isDuplicateKeyError", () => {
  it("returns true for a Mongo E11000 error", () => {
    const error = new MongoServerError({ message: "dup", code: 11000 });
    expect(isDuplicateKeyError(error)).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isDuplicateKeyError(new Error("boom"))).toBe(false);
  });
});
