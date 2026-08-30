import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "@/lib/http/client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(implementation: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(implementation);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiRequest", () => {
  it("returns the parsed body on success", async () => {
    mockFetch(async () => jsonResponse({ stall: { stallNumber: "A-12" } }, 201));

    const result = await apiRequest<{ stall: { stallNumber: string } }>("/api/stalls");
    expect(result).toEqual({ ok: true, status: 201, data: { stall: { stallNumber: "A-12" } } });
  });

  it("serialises `json` and sets the content type", async () => {
    const spy = mockFetch(async () => jsonResponse({}));

    await apiRequest("/api/stalls", { method: "POST", json: { basePrice: 500 } });

    const init = spy.mock.calls[0][1]!;
    expect(init.body).toBe(JSON.stringify({ basePrice: 500 }));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("sends an idempotency key as a header", async () => {
    const spy = mockFetch(async () => jsonResponse({}));

    await apiRequest("/api/bookings", { method: "POST", json: {}, idempotencyKey: "abc-123" });

    expect(new Headers(spy.mock.calls[0][1]!.headers).get("Idempotency-Key")).toBe("abc-123");
  });

  it("passes through error, code and field errors from a failed response", async () => {
    mockFetch(async () =>
      jsonResponse(
        { error: "Check the stall details.", code: "VALIDATION_FAILED", fieldErrors: { basePrice: ["Too low."] } },
        400,
      ),
    );

    const result = await apiRequest("/api/stalls", { method: "POST", json: {} });
    if (result.ok) throw new Error("expected failure");

    expect(result.status).toBe(400);
    expect(result.code).toBe("VALIDATION_FAILED");
    expect(result.fieldErrors).toEqual({ basePrice: ["Too low."] });
  });

  it("falls back to a status-specific sentence when the body is not JSON", async () => {
    // This is the case that used to throw inside callers and strand buttons on "Saving...": a
    // route that fails before producing JSON, e.g. an HTML error page from the platform.
    mockFetch(async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }));

    const result = await apiRequest("/api/stalls");
    if (result.ok) throw new Error("expected failure");

    expect(result.status).toBe(502);
    expect(result.error).toBe("Something went wrong on our end. Please try again.");
  });

  it("reports a permission failure with a 404 body as such", async () => {
    mockFetch(async () => new Response(null, { status: 404 }));

    const result = await apiRequest("/api/organizations/x/summary");
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toBe("We couldn't find what you're looking for.");
  });

  it("reports a network failure as status 0 rather than throwing", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await apiRequest("/api/stalls");
    if (result.ok) throw new Error("expected failure");

    expect(result.status).toBe(0);
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("treats 204 as success with no data", async () => {
    mockFetch(async () => new Response(null, { status: 204 }));

    const result = await apiRequest("/api/stalls/1");
    expect(result.ok).toBe(true);
    expect(result.ok && result.data).toBeUndefined();
  });

  it("treats a 2xx that still carries an error string as a failure", async () => {
    // Older routes answered 200 with { error }. A caller must never read that as success.
    mockFetch(async () => jsonResponse({ error: "Stall is no longer available" }, 200));

    const result = await apiRequest("/api/bookings", { method: "POST" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe("Stall is no longer available");
  });
});
