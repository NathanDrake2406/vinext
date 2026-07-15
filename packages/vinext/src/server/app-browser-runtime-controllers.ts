type AppBrowserRuntimeControllerFactories<
  THistoryController extends object,
  TMpaNavigationScheduler extends object,
> = {
  createHistoryController: () => THistoryController;
  createMpaNavigationScheduler: () => TMpaNavigationScheduler;
};

/**
 * Owns lazy construction for browser runtime controllers whose modules may land
 * in a circular production chunk graph. The factories keep imported class
 * bindings inside runtime calls so module evaluation cannot observe a class
 * before its defining chunk has initialized it.
 */
export function createAppBrowserRuntimeControllerAccessors<
  THistoryController extends object,
  TMpaNavigationScheduler extends object,
>(
  factories: AppBrowserRuntimeControllerFactories<THistoryController, TMpaNavigationScheduler>,
): {
  getHistoryController: () => THistoryController;
  getMpaNavigationScheduler: () => TMpaNavigationScheduler;
} {
  let historyController: THistoryController | undefined;
  let mpaNavigationScheduler: TMpaNavigationScheduler | undefined;

  return {
    getHistoryController: () => (historyController ??= factories.createHistoryController()),
    getMpaNavigationScheduler: () =>
      (mpaNavigationScheduler ??= factories.createMpaNavigationScheduler()),
  };
}
