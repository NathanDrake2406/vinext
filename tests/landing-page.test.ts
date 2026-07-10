import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { LandingPage } from "../apps/web/app/page";
import { resolveLandingStats, type LandingStats } from "../apps/web/app/lib/landing-stats";

vi.mock("@/app/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/app/lib/db/schema", () => ({ compatRuns: {} }));
vi.mock("@/app/lib/benchmarks/server", () => ({ getPerformanceRuns: vi.fn() }));

const LIVE_STATS: LandingStats = {
  compatPassRate: 88,
  buildSeconds: { vinext: 3.1, nextjs: 6.2 },
  bundleBytes: { vinext: 125 * 1024, nextjs: 185 * 1024 },
  provenance: {
    compatibility: {
      source: "live",
      measuredAt: "2026-07-10T17:00:00.000Z",
      commitSha: "abcdef1234567890",
    },
    benchmark: {
      source: "live",
      measuredAt: "2026-07-10T17:00:00.000Z",
      commitSha: "abcdef1234567890",
    },
  },
};

describe("landing statistics", () => {
  it("marks fixed figures as fallbacks when data loading fails", () => {
    const stats = resolveLandingStats(
      { status: "rejected", reason: new Error("compat unavailable") },
      { status: "rejected", reason: new Error("benchmarks unavailable") },
    );

    expect(stats.provenance).toEqual({
      compatibility: { source: "fallback" },
      benchmark: { source: "fallback" },
    });
  });

  it("uses one complete live benchmark snapshot with its provenance", () => {
    const stats = resolveLandingStats(
      {
        status: "fulfilled",
        value: {
          passRate: 88,
          measuredAt: "2026-07-10T16:00:00.000Z",
          commitSha: "compat-sha",
        },
      },
      {
        status: "fulfilled",
        value: [
          {
            commitSha: "benchmark-sha",
            measuredAt: "2026-07-10T17:00:00.000Z",
            measurements: [
              { scenarioId: "production-build", implementationId: "vinext", median: 3_100 },
              { scenarioId: "production-build", implementationId: "nextjs", median: 6_200 },
              { scenarioId: "client-bundle-gzip", implementationId: "vinext", median: 128_000 },
              { scenarioId: "client-bundle-gzip", implementationId: "nextjs", median: 189_440 },
            ],
          },
        ],
      },
    );

    expect(stats).toMatchObject({
      compatPassRate: 88,
      buildSeconds: { vinext: 3.1, nextjs: 6.2 },
      bundleBytes: { vinext: 128_000, nextjs: 189_440 },
      provenance: {
        compatibility: {
          source: "live",
          measuredAt: "2026-07-10T16:00:00.000Z",
          commitSha: "compat-sha",
        },
        benchmark: {
          source: "live",
          measuredAt: "2026-07-10T17:00:00.000Z",
          commitSha: "benchmark-sha",
        },
      },
    });
  });

  it("does not mix a partial live benchmark run with fallback figures", () => {
    const stats = resolveLandingStats(
      { status: "fulfilled", value: null },
      {
        status: "fulfilled",
        value: [
          {
            commitSha: "partial-sha",
            measuredAt: "2026-07-10T17:00:00.000Z",
            measurements: [
              { scenarioId: "production-build", implementationId: "vinext", median: 3_100 },
              { scenarioId: "production-build", implementationId: "nextjs", median: 6_200 },
            ],
          },
        ],
      },
    );

    expect(stats.buildSeconds).toEqual({ vinext: 3.1, nextjs: 6.2 });
    expect(stats.provenance.benchmark).toEqual({ source: "fallback" });
  });
});

describe("landing page claims", () => {
  it("qualifies live measurements and server-renders the completed race", () => {
    const html = renderToStaticMarkup(createElement(LandingPage, { stats: LIVE_STATS }));

    expect(html).toContain("88% deploy-suite test pass rate");
    expect(html).not.toContain("Next.JS API surface");
    expect(html).toContain("2× faster in our 33-route benchmark.");
    expect(html).toContain("33-route dynamic-render benchmark");
    expect(html).toContain("commit abcdef1");
    expect(html).toContain("Jul 10, 2026, 5:00 PM UTC");
    expect(html).toContain("smaller client bundle in the same benchmark");
    expect(html).toContain("Keep your app structure.");
    expect(html).toContain("vinext check");
    expect(html).toContain("app structure · preserved");
    expect(html).toContain("vite + @vitejs/plugin-rsc");
    expect(html).not.toContain("Your code stays exactly the same.");
    expect(html).not.toContain("Nothing to rewrite.");
    expect(html).not.toContain("your code · unchanged");
    expect(html).not.toContain("Same code");
    expect(html).not.toContain("next build · next.js 16");
    expect(html).toContain(">3.1s</span>");
    expect(html).toContain(">6.2s</span>");
    expect(html).not.toContain(">0.0s</span>");
    expect(html).toContain("transform:scaleX(0.5000)");
  });

  it("labels fallback figures instead of presenting them as live comparisons", () => {
    const stats: LandingStats = {
      ...LIVE_STATS,
      provenance: {
        compatibility: { source: "fallback" },
        benchmark: { source: "fallback" },
      },
    };
    const html = renderToStaticMarkup(createElement(LandingPage, { stats }));

    expect(html).toContain("88% deploy-suite test pass rate");
    expect(html).toContain("live deploy-suite data unavailable");
    expect(html).toContain("33-route benchmark snapshot.");
    expect(html).toContain("live benchmark data unavailable");
    expect(html).not.toContain("2× faster in our 33-route benchmark.");
  });
});
