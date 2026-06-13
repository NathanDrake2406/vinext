import { describe, expect, it } from "vite-plus/test";
import {
  appendAssetDeploymentIdQuery,
  appendDeploymentIdQuery,
  stripDeploymentIdQuery,
} from "../packages/vinext/src/utils/deployment-id.js";

describe("appendDeploymentIdQuery", () => {
  it("inserts the deployment query before URL fragments", () => {
    expect(appendDeploymentIdQuery("/_next/static/chunk.js#module", "dpl_123")).toBe(
      "/_next/static/chunk.js?dpl=dpl_123#module",
    );
  });

  it("preserves existing queries and fragments", () => {
    expect(appendDeploymentIdQuery("/_next/static/chunk.js?v=1#module", "dpl_123")).toBe(
      "/_next/static/chunk.js?v=1&dpl=dpl_123#module",
    );
  });

  it("does not append a duplicate deployment query", () => {
    expect(appendDeploymentIdQuery("/_next/static/chunk.js?dpl=existing#module", "dpl_123")).toBe(
      "/_next/static/chunk.js?dpl=existing#module",
    );
  });

  it("only appends asset deployment queries to managed static assets", () => {
    expect(appendAssetDeploymentIdQuery("/@id/virtual:entry", "dpl_123")).toBe(
      "/@id/virtual:entry",
    );
    expect(
      appendAssetDeploymentIdQuery("https://fonts.googleapis.com/css2?family=Inter", "dpl_123"),
    ).toBe("https://fonts.googleapis.com/css2?family=Inter");
    expect(appendAssetDeploymentIdQuery("/_next/static/chunk.js", "dpl_123")).toBe(
      "/_next/static/chunk.js?dpl=dpl_123",
    );
  });
});

describe("stripDeploymentIdQuery", () => {
  it("removes the deployment query while preserving other query params and fragments", () => {
    expect(stripDeploymentIdQuery("/_next/static/chunk.js?v=1&dpl=dpl_123#module")).toBe(
      "/_next/static/chunk.js?v=1#module",
    );
  });

  it("preserves absolute URL origins", () => {
    expect(
      stripDeploymentIdQuery("https://cdn.example.com/_next/static/chunk.js?dpl=dpl_123"),
    ).toBe("https://cdn.example.com/_next/static/chunk.js");
  });

  it("preserves protocol-relative URL hosts", () => {
    expect(stripDeploymentIdQuery("//cdn.example.com/_next/static/chunk.js?dpl=dpl_123")).toBe(
      "//cdn.example.com/_next/static/chunk.js",
    );
  });

  it("preserves non-leading relative URL paths", () => {
    expect(stripDeploymentIdQuery("_next/static/chunk.js?dpl=dpl_123")).toBe(
      "_next/static/chunk.js",
    );
  });

  it("returns URLs without deployment queries unchanged", () => {
    expect(stripDeploymentIdQuery("/_next/static/chunk.js?v=1#module")).toBe(
      "/_next/static/chunk.js?v=1#module",
    );
  });
});
