import { createElement, type ReactNode } from "react";

export type ReactCacheScopeRunner = <T>(run: () => Promise<T>) => Promise<T>;

type ReactCacheScopeRenderer = (
  element: ReactNode,
  options: { onError: (error: unknown) => void },
) => ReadableStream<Uint8Array>;

/**
 * Builds a runner that executes work inside its own React request cache.
 *
 * React's `cache()` only memoizes while a Flight request is current; anywhere
 * else every call computes a fresh value. Probes invoke server components as
 * plain functions before the real render exists, so a value one component
 * stores through `cache()` (next-intl's `setRequestLocale()`) is invisible to
 * the next component the probe walks, which then takes its request-API
 * fallback and marks a static route dynamic.
 *
 * React exposes no API to open a cache scope, so the work is hosted in a
 * throwaway Flight render: the request React creates for it is what `cache()`
 * resolves for everything the work awaits. Each call gets a separate request,
 * so nothing is shared with the real render or with another scope.
 */
export function createReactCacheScopeRunner(
  renderToReadableStream: ReactCacheScopeRenderer,
): ReactCacheScopeRunner {
  return <T>(run: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      async function ReactCacheScopeHost(): Promise<null> {
        // Leave Flight's synchronous render pass first. Inside it hooks are
        // live, so the first component the work calls would behave differently
        // from every one it reaches after an await.
        await Promise.resolve();
        try {
          resolve(await run());
        } catch (error) {
          reject(error);
        }
        return null;
      }

      const stream = renderToReadableStream(createElement(ReactCacheScopeHost), {
        onError: reject,
      });
      // Flight keeps the request alive until its output is consumed.
      drainStream(stream).catch(reject);
    });
}

async function drainStream(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    // The host renders nothing; only completion matters.
  }
}
