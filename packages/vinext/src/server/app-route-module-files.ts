import type { AppRoute } from "../routing/app-router.js";

type RouteModuleFilesOptions = {
  includeRouteHandler?: boolean;
};

function compactFilePaths(filePaths: readonly (string | null | undefined)[]): string[] {
  return filePaths.filter((filePath): filePath is string => typeof filePath === "string");
}

export function collectAppRouteModuleFiles(
  route: AppRoute,
  options: RouteModuleFilesOptions = {},
): string[] {
  return compactFilePaths([
    route.pagePath,
    options.includeRouteHandler ? route.routePath : null,
    ...route.layouts,
    ...route.templates,
    route.loadingPath,
    route.errorPath,
    ...route.layoutErrorPaths,
    ...(route.errorPaths ?? []),
    route.notFoundPath,
    ...route.notFoundPaths,
    route.forbiddenPath,
    ...route.forbiddenPaths,
    route.unauthorizedPath,
    ...route.unauthorizedPaths,
    ...route.parallelSlots.flatMap((slot) => [
      slot.pagePath,
      slot.defaultPath,
      slot.layoutPath,
      slot.loadingPath,
      slot.errorPath,
      ...slot.interceptingRoutes.flatMap((intercept) => [
        intercept.pagePath,
        ...intercept.layoutPaths,
      ]),
    ]),
    ...(route.siblingIntercepts ?? []).flatMap((intercept) => [
      intercept.pagePath,
      ...intercept.layoutPaths,
    ]),
  ]);
}
