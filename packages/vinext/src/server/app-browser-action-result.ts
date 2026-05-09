export type AppBrowserServerActionResult<TRoot> = {
  root?: TRoot;
  returnValue?: {
    ok: boolean;
    data: unknown;
  };
};

export function isServerActionResult<TRoot>(
  value: unknown,
): value is AppBrowserServerActionResult<TRoot> {
  return !!value && typeof value === "object" && ("returnValue" in value || "root" in value);
}

export function shouldClearClientNavigationCachesForServerActionResult<TRoot>(
  result: AppBrowserServerActionResult<TRoot> | TRoot,
): boolean {
  if (!isServerActionResult<TRoot>(result)) {
    return true;
  }

  return result.root !== undefined;
}
