import type { AppPageParams } from "./app-page-boundary.js";
import { isCatchAllSegment, isOptionalCatchAllSegment } from "../routing/utils.js";

export const APP_PAGE_SEGMENT_KEY = "__PAGE__";

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]") && !segment.includes(".");
}

export function isAppPageRouteGroupSegment(segment: string): boolean {
  return segment.startsWith("(") && segment.endsWith(")");
}

type AppPageSegmentParamType = "d" | "c" | "oc";

type AppPageSegmentParam = {
  name: string;
  type: AppPageSegmentParamType;
};

function formatParamSegmentValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.join("/");
  }
  return value;
}

function readSegmentParam(segment: string): AppPageSegmentParam | null {
  if (isOptionalCatchAllSegment(segment)) {
    return {
      name: segment.slice(5, -2),
      type: "oc",
    };
  }

  if (isCatchAllSegment(segment)) {
    return {
      name: segment.slice(4, -1),
      type: "c",
    };
  }

  if (isDynamicSegment(segment)) {
    return {
      name: segment.slice(1, -1),
      type: "d",
    };
  }

  return null;
}

function formatSegmentStateParamValue(
  param: AppPageSegmentParam,
  params: AppPageParams,
  fallbackSegment: string,
): string {
  const value = params[param.name];

  if (
    param.type === "oc" &&
    (value === undefined || (Array.isArray(value) && value.length === 0))
  ) {
    return "";
  }

  return formatParamSegmentValue(value) ?? fallbackSegment;
}

function resolveSingleSegmentStateKey(segment: string, params: AppPageParams): string {
  const param = readSegmentParam(segment);
  if (!param) {
    return segment;
  }

  return `${param.name}|${formatSegmentStateParamValue(param, params, segment)}|${param.type}`;
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

  resolvedSegments.push(APP_PAGE_SEGMENT_KEY);
  return resolvedSegments;
}

export function resolveAppPageSegmentStateKey(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string {
  for (const segment of routeSegments.slice(treePosition)) {
    if (!isAppPageRouteGroupSegment(segment)) {
      return resolveSingleSegmentStateKey(segment, params);
    }
  }
  return "";
}

export function resolveAppPageRouteStateKey(
  routeSegments: readonly string[],
  params: AppPageParams,
): string {
  const statePath: string[] = [];

  for (const segment of routeSegments) {
    if (!isAppPageRouteGroupSegment(segment)) {
      statePath.push(resolveSingleSegmentStateKey(segment, params));
    }
  }

  return statePath.length > 0 ? JSON.stringify(statePath) : "";
}

export function resolveAppPagePatternStateKey(
  patternParts: readonly string[],
  params: AppPageParams,
): string {
  return resolveAppPageRouteStateKey(
    patternParts.map((part) => {
      if (!part.startsWith(":")) return part;
      if (part.endsWith("*")) return `[[...${part.slice(1, -1)}]]`;
      if (part.endsWith("+")) return `[...${part.slice(1, -1)}]`;
      return `[${part.slice(1)}]`;
    }),
    params,
  );
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

export function resolveAppPageTemplateStateKey(
  routeSegments: readonly string[],
  treePosition: number,
  params: AppPageParams,
): string {
  const ownerStateKey = resolveAppPageRouteStateKey(routeSegments.slice(0, treePosition), params);
  for (let end = treePosition + 1; end <= routeSegments.length; end++) {
    const activeStateKey = resolveAppPageRouteStateKey(routeSegments.slice(0, end), params);
    if (activeStateKey !== ownerStateKey) return activeStateKey;
  }
  return ownerStateKey || resolveAppPageLeafSegmentStateKey(routeSegments, params);
}
