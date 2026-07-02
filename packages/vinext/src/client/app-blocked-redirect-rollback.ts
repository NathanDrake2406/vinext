type BlockedRedirectRollbackHandler = (redirect: string) => boolean;

let blockedRedirectRollbackHandler: BlockedRedirectRollbackHandler | null = null;

export function registerBlockedRedirectRollbackHandler(
  handler: BlockedRedirectRollbackHandler,
): () => void {
  blockedRedirectRollbackHandler = handler;
  return () => {
    if (blockedRedirectRollbackHandler === handler) {
      blockedRedirectRollbackHandler = null;
    }
  };
}

export function rollbackBlockedRedirectNavigation(redirect: string): boolean {
  return blockedRedirectRollbackHandler?.(redirect) ?? false;
}
