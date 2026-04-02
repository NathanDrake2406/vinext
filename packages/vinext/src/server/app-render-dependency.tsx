import { type ReactNode } from "react";

export type AppRenderDependency = {
  promise: Promise<void>;
  release: () => void;
};

export function createAppRenderDependency(): AppRenderDependency {
  let released = false;
  let resolve!: () => void;

  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {
    promise,
    release() {
      if (released) {
        return;
      }
      released = true;
      resolve();
    },
  };
}

export function renderAfterAppDependencies(
  children: ReactNode,
  dependencies: readonly AppRenderDependency[],
): ReactNode {
  if (dependencies.length === 0) {
    return children;
  }

  async function AwaitAppRenderDependencies() {
    await Promise.all(dependencies.map((dependency) => dependency.promise));
    return children;
  }

  return <AwaitAppRenderDependencies />;
}

export function renderWithAppDependencyBarrier(
  children: ReactNode,
  dependency: AppRenderDependency,
): ReactNode {
  function ReleaseAppRenderDependency() {
    dependency.release();
    return null;
  }

  return (
    <>
      <ReleaseAppRenderDependency />
      {children}
    </>
  );
}
