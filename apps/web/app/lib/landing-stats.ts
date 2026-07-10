import { desc, eq } from "drizzle-orm";
import { getDb } from "@/app/lib/db/client";
import { compatRuns } from "@/app/lib/db/schema";
import { getPerformanceRuns } from "@/app/lib/benchmarks/server";

/**
 * Headline numbers for the landing page, sourced from the same D1 data that
 * backs /compatibility and /benchmarks so the marketing claims track reality.
 *
 * Every field carries a static fallback (the last hand-verified numbers) so
 * the page still renders in dev without a D1 binding or before the first
 * ingest. Failures fall back silently: the landing page is not the place to
 * surface pipeline errors — /compatibility and /benchmarks already do.
 */
export type LandingStats = {
  /** Latest deploy-suite pass rate, integer percent. */
  compatPassRate: number;
  /** Clean production build, seconds (median of latest main run). */
  buildSeconds: { vinext: number; nextjs: number };
  /** Gzipped client bundle, bytes (median of latest main run). */
  bundleBytes: { vinext: number; nextjs: number };
};

const FALLBACK: LandingStats = {
  compatPassRate: 92,
  buildSeconds: { vinext: 3.1, nextjs: 6.2 },
  bundleBytes: { vinext: 125 * 1024, nextjs: 185 * 1024 },
};

async function loadCompatPassRate(): Promise<number | null> {
  const db = getDb();
  const [latest] = await db
    .select({ total: compatRuns.total, passed: compatRuns.passed })
    .from(compatRuns)
    .where(eq(compatRuns.kind, "deploy"))
    .orderBy(desc(compatRuns.createdAt))
    .limit(1);
  if (!latest || latest.total <= 0) return null;
  return Math.round((latest.passed / latest.total) * 100);
}

function implementationPair(
  measurements: Awaited<ReturnType<typeof getPerformanceRuns>>[number]["measurements"],
  scenarioId: string,
): { vinext: number; nextjs: number } | null {
  const median = (implementationId: string) =>
    measurements.find((m) => m.scenarioId === scenarioId && m.implementationId === implementationId)
      ?.median;
  const vinext = median("vinext");
  const nextjs = median("nextjs");
  if (vinext === undefined || nextjs === undefined || vinext <= 0 || nextjs <= 0) return null;
  return { vinext, nextjs };
}

export async function getLandingStats(): Promise<LandingStats> {
  const [compat, perf] = await Promise.allSettled([loadCompatPassRate(), getPerformanceRuns(1)]);

  const stats = { ...FALLBACK };

  if (compat.status === "fulfilled" && compat.value !== null) {
    stats.compatPassRate = compat.value;
  }

  if (perf.status === "fulfilled" && perf.value.length > 0) {
    const measurements = perf.value[0].measurements;
    const build = implementationPair(measurements, "production-build");
    if (build) {
      stats.buildSeconds = { vinext: build.vinext / 1000, nextjs: build.nextjs / 1000 };
    }
    const bundle = implementationPair(measurements, "client-bundle-gzip");
    if (bundle) stats.bundleBytes = bundle;
  }

  return stats;
}

/** "2×" for 2.04, "1.8×" for 1.83 — near-integer multiples read cleaner rounded. */
function formatMultiple(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
}

export function formatKb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Comparative framing for a vinext-vs-Next.js pair, derived once so copy can
 * never disagree with the measured ordering. The numbers are live: a
 * regression must read "1.2× slower", not "0.8× faster".
 */
type Verdict = "better" | "worse" | "par";

export type BuildComparison = {
  verdict: Verdict;
  /** Winner-relative multiple, always ≥ 1 (e.g. "2×"). "1×" on "par". */
  multiple: string;
};

export function compareBuild(seconds: LandingStats["buildSeconds"]): BuildComparison {
  // Decide on the displayed (rounded) ratio so we never render "1× faster".
  const ratio = Math.round((seconds.nextjs / seconds.vinext) * 10) / 10;
  if (ratio === 1) return { verdict: "par", multiple: "1×" };
  return ratio > 1
    ? { verdict: "better", multiple: formatMultiple(ratio) }
    : { verdict: "worse", multiple: formatMultiple(1 / ratio) };
}

export type BundleComparison = {
  verdict: Verdict;
  /** Absolute size difference as integer percent of the Next.js bundle. */
  pct: number;
};

export function compareBundle(bytes: LandingStats["bundleBytes"]): BundleComparison {
  const pct = Math.round((1 - bytes.vinext / bytes.nextjs) * 100);
  if (pct === 0) return { verdict: "par", pct: 0 };
  return pct > 0 ? { verdict: "better", pct } : { verdict: "worse", pct: -pct };
}
