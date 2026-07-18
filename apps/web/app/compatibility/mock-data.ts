/**
 * Dev-only fallback data for /compatibility when the local D1 database has
 * no runs. mock-data.json is a snapshot of the real vinext.dev/compatibility
 * page props (cells + trend extracted from its RSC payload on 2026-07-18),
 * so the local dashboard mirrors production exactly — real suite paths,
 * classifications, and 74 runs of trend history. Never rendered in
 * production builds; refresh by re-extracting from the live page.
 */
import type { GridCell } from "./contribution-grid";
import type { TrendPoint } from "./compatibility-line-chart";
import snapshot from "./mock-data.json";

// Boundary assertion: the JSON is a verbatim capture of the server's
// serialized props for these exact component types, checked at capture time
// (799 cells, keys and enum values validated). Re-validate if re-captured.
const data = snapshot as { cells: GridCell[]; trend: TrendPoint[] };

export function mockCells(): GridCell[] {
  return data.cells;
}

export function mockTrend(): TrendPoint[] {
  return data.trend;
}
