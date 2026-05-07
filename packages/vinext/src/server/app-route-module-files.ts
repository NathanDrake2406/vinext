import type { AppRoute } from "../routing/app-router.js";

type RouteModuleFilesOptions = {
  includeRouteHandler?: boolean;
};

export function collectAppRouteModuleFiles(
  route: AppRoute,
  options: RouteModuleFilesOptions = {},
): string[] {
  const files = [
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
  ];

  return files.filter((filePath): filePath is string => typeof filePath === "string");
}
