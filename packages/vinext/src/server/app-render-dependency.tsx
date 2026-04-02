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

  return (
    <AwaitAppRenderDependencies dependencies={dependencies}>{children}</AwaitAppRenderDependencies>
  );
}

export function renderWithAppDependencyBarrier(
  children: ReactNode,
  dependency: AppRenderDependency,
): ReactNode {
  return (
    <>
      <ReleaseAppRenderDependency dependency={dependency} />
      {children}
    </>
  );
}

async function AwaitAppRenderDependencies({
  children,
  dependencies,
}: {
  children: ReactNode;
  dependencies: readonly AppRenderDependency[];
}) {
  await Promise.all(dependencies.map((dependency) => dependency.promise));
  return children;
}

function ReleaseAppRenderDependency({ dependency }: { dependency: AppRenderDependency }) {
  dependency.release();
  return null;
}
