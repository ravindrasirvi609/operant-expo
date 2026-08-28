import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/http/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(checkRateLimit(key, { limit: 3, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(a, { limit: 3, windowMs: 60_000 });
    expect(checkRateLimit(b, { limit: 3, windowMs: 60_000 }).allowed).toBe(true);
  });
});
