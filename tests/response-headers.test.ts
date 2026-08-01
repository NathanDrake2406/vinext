import { describe, expect, it } from "vite-plus/test";
import { ensureMutableResponse } from "../packages/vinext/src/server/response-headers.js";

describe("ensureMutableResponse", () => {
  it("returns the same Response when its headers are already writable", () => {
    const response = new Response("body", { status: 200, headers: { "x-kept": "yes" } });

    expect(ensureMutableResponse(response)).toBe(response);
  });

  it("preserves a header that collides with the probe name", () => {
    // The probe deletes, so it must never run against a response that already
    // carries the name. Stripping a header the framework does not own is the
    // same class of bug this helper exists to prevent.
    const response = new Response("body", {
      headers: { "x-vinext-header-guard-probe": "set-by-userland" },
    });

    const mutable = ensureMutableResponse(response);

    expect(mutable.headers.get("x-vinext-header-guard-probe")).toBe("set-by-userland");
    expect(() => mutable.headers.set("Vary", "RSC")).not.toThrow();
  });

  it("copies a Response with immutable headers so the framework can write to it", () => {
    // Response.redirect() carries the "immutable" headers guard, same as fetch().
    const response = Response.redirect("https://example.test/next", 307);

    const mutable = ensureMutableResponse(response);

    expect(mutable).not.toBe(response);
    expect(mutable.status).toBe(307);
    expect(mutable.headers.get("Location")).toBe("https://example.test/next");
    expect(() => mutable.headers.set("Vary", "RSC")).not.toThrow();
    // The original stays untouched — nothing else holds a stale reference to a
    // Response we half-mutated.
    expect(response.headers.get("Vary")).toBeNull();
  });

  it("hands back a status-0 Response unchanged rather than failing to reconstruct it", () => {
    // The Response constructor rejects status 0, so Response.error() and opaque
    // responses cannot be copied. Returning the original keeps the caller's own
    // error path in charge instead of raising a RangeError here.
    const response = Response.error();

    expect(ensureMutableResponse(response)).toBe(response);
  });
});
