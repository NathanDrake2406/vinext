import { createElement, type ReactNode } from "react";

export type ReactCacheScopeRunner = <T>(run: () => Promise<T>) => Promise<T>;

type ReactCacheScopeRenderer = (
  element: ReactNode,
  options: { onError: (error: unknown) => void },
) => ReadableStream<Uint8Array>;

type ReactCacheScopeOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs work inside its own React request cache.
 *
 * `cache()` only memoizes while a Flight request is current, and probes call
 * server components before the real render exists. React has no API to open a
 * cache scope, so the work is hosted in a throwaway Flight render. The runner
 * settles once that render has finished.
 */
export function createReactCacheScopeRunner(
  renderToReadableStream: ReactCacheScopeRenderer,
): ReactCacheScopeRunner {
  return async <T>(run: () => Promise<T>): Promise<T> => {
    let outcome: ReactCacheScopeOutcome<T> | undefined;
    let renderError: { error: unknown } | undefined;

    async function ReactCacheScopeHost(): Promise<null> {
      // Leave Flight's synchronous pass first: hooks are live only there.
      await Promise.resolve();
      try {
        outcome = { ok: true, value: await run() };
      } catch (error) {
        outcome = { ok: false, error };
      }
      return null;
    }

    const stream = renderToReadableStream(createElement(ReactCacheScopeHost), {
      onError(error) {
        renderError ??= { error };
      },
    });
    const reader = stream.getReader();
    while (!(await reader.read()).done) {
      // Only the end of the render matters.
    }

    if (outcome === undefined) {
      throw renderError?.error ?? new Error("React cache scope render ended before its work ran");
    }
    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.value;
  };
}
