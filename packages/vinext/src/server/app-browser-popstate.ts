type PopstateRestoreHandlerDependencies = {
  getActiveNavigationId: () => number;
  getNavigate: () =>
    | ((href: string, redirectDepth: number, navigationKind: "traverse") => Promise<void>)
    | null
    | undefined;
  getPendingNavigation: () => Promise<void> | null;
  isCurrentNavigation: (navId: number) => boolean;
  notifyAppRouterTransitionStart: (href: string) => void;
  restorePopstateScrollPosition: (state: unknown) => void;
  setPendingNavigation: (pendingNavigation: Promise<void> | null) => void;
};

export function createPopstateRestoreHandler({
  getActiveNavigationId,
  getNavigate,
  getPendingNavigation,
  isCurrentNavigation,
  notifyAppRouterTransitionStart,
  restorePopstateScrollPosition: restore,
  setPendingNavigation,
}: PopstateRestoreHandlerDependencies): (event: PopStateEvent) => void {
  return (event) => {
    notifyAppRouterTransitionStart(window.location.href);
    const navigateRsc = getNavigate();
    const pendingNavigation =
      navigateRsc?.(window.location.href, 0, "traverse") ?? Promise.resolve();
    const popstateNavId = navigateRsc ? getActiveNavigationId() : null;
    setPendingNavigation(pendingNavigation);
    void pendingNavigation.finally(() => {
      if (popstateNavId === null || isCurrentNavigation(popstateNavId)) {
        restore(event.state);
      }
      if (getPendingNavigation() === pendingNavigation) {
        setPendingNavigation(null);
      }
    });
  };
}
