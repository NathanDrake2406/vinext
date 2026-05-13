import type { AppPageParams } from "./app-page-boundary.js";

function isOptionalCatchAllSegment(segment: string): boolean {
  return segment.startsWith("[[...") && segment.endsWith("]]") && segment.length > 7;
}

function isCatchAllSegment(segment: string): boolean {
  return segment.startsWith("[...") && segment.endsWith("]") && segment.length > 5;
}

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]") && !segment.includes(".");
}

function isRouteGroupSegment(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

function formatParamSegmentValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.join("/");
  }
  return value;
}

export function resolveAppPageChildSegments(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string[] {
  const rawSegments = routeSegments.slice(treePosition);
  const resolvedSegments: string[] = [];

  for (const segment of rawSegments) {
    if (isOptionalCatchAllSegment(segment)) {
      const paramName = segment.slice(5, -2);
      const paramValue = params[paramName];
      if (Array.isArray(paramValue) && paramValue.length === 0) {
        continue;
      }
      const resolvedValue = formatParamSegmentValue(paramValue);
      if (resolvedValue !== undefined) {
        resolvedSegments.push(resolvedValue);
      }
      continue;
    }

    if (isCatchAllSegment(segment)) {
      const paramName = segment.slice(4, -1);
      resolvedSegments.push(formatParamSegmentValue(params[paramName]) ?? segment);
      continue;
    }

    if (isDynamicSegment(segment)) {
      const paramName = segment.slice(1, -1);
      resolvedSegments.push(formatParamSegmentValue(params[paramName]) ?? segment);
      continue;
    }

    resolvedSegments.push(segment);
  }

  return resolvedSegments;
}

export function resolveAppPageSegmentStateKey(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string {
  for (const segment of resolveAppPageChildSegments(routeSegments, treePosition, params)) {
    if (!isRouteGroupSegment(segment)) {
      return segment;
    }
  }
  return "";
}

export function resolveAppPageLeafSegmentStateKey(
  routeSegments: readonly string[],
  params: AppPageParams,
): string {
  for (let treePosition = routeSegments.length - 1; treePosition >= 0; treePosition--) {
    const segmentStateKey = resolveAppPageSegmentStateKey(routeSegments, treePosition, params);
    if (segmentStateKey) {
      return segmentStateKey;
    }
  }
  return "";
}
