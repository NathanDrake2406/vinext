import { describe, expect, it } from "vite-plus/test";
import {
  cloneRequestWithHeaders,
  cloneRequestWithUrl,
  filterInternalHeaders,
} from "../packages/vinext/src/server/request-pipeline.js";
import {
  MIDDLEWARE_NEXT_HEADER,
  VINEXT_PRERENDER_ROUTE_PARAMS_HEADER,
} from "../packages/vinext/src/server/headers.js";

describe("request-pipeline no-op request cloning", () => {
  it("keeps the original request when internal-header filtering is a no-op", () => {
    const request = new Request("https://example.test/about", {
      headers: { accept: "text/html" },
    });

    const filteredHeaders = filterInternalHeaders(request.headers);
    const filteredRequest = cloneRequestWithHeaders(request, filteredHeaders);

    expect(filteredHeaders.get("accept")).toBe("text/html");
    expect(filteredRequest).toBe(request);
  });

  it("materialises headers and clones when trusted framework headers are attached", () => {
    const request = new Request("https://example.test/about", {
      headers: { accept: "text/html" },
    });

    const filteredHeaders = filterInternalHeaders(request.headers);
    filteredHeaders.set(VINEXT_PRERENDER_ROUTE_PARAMS_HEADER, "%7B%7D");
    const filteredRequest = cloneRequestWithHeaders(request, filteredHeaders);

    expect(filteredRequest).not.toBe(request);
    expect(filteredRequest.headers.get("accept")).toBe("text/html");
    expect(filteredRequest.headers.get(VINEXT_PRERENDER_ROUTE_PARAMS_HEADER)).toBe("%7B%7D");
    expect(request.headers.get(VINEXT_PRERENDER_ROUTE_PARAMS_HEADER)).toBeNull();
  });

  it("strips forged internal headers and clones the request when filtering changes headers", () => {
    const request = new Request("https://example.test/about", {
      headers: {
        accept: "text/html",
        [MIDDLEWARE_NEXT_HEADER]: "1",
      },
    });

    const filteredHeaders = filterInternalHeaders(request.headers);
    const filteredRequest = cloneRequestWithHeaders(request, filteredHeaders);

    expect(filteredHeaders.get(MIDDLEWARE_NEXT_HEADER)).toBeNull();
    expect(filteredRequest).not.toBe(request);
    expect(filteredRequest.headers.get("accept")).toBe("text/html");
    expect(filteredRequest.headers.get(MIDDLEWARE_NEXT_HEADER)).toBeNull();
  });

  it("preserves Workers cf metadata when a header clone is still needed", () => {
    const request = new Request("https://example.test/about", {
      headers: { accept: "text/html" },
    });
    const cf = { colo: "SYD" };
    Object.defineProperty(request, "cf", {
      value: cf,
      enumerable: true,
      configurable: true,
    });

    const filteredHeaders = filterInternalHeaders(request.headers);
    filteredHeaders.set(VINEXT_PRERENDER_ROUTE_PARAMS_HEADER, "%7B%7D");
    const filteredRequest = cloneRequestWithHeaders(request, filteredHeaders);

    expect(filteredRequest).not.toBe(request);
    expect(Reflect.get(filteredRequest, "cf")).toBe(cf);
  });

  it("keeps the original request when URL cloning is a no-op", () => {
    const request = new Request("https://example.test/about");

    expect(cloneRequestWithUrl(request, request.url)).toBe(request);
  });
});
