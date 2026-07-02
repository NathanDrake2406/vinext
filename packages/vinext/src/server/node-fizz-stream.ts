import { PassThrough, type Readable as NodeReadable } from "node:stream";
import type { ReactNode } from "react";
import {
  renderToPipeableStream,
  type PipeableStream,
  type RenderToPipeableStreamOptions,
} from "react-dom/server";

export type NodeFizzRenderOptions = RenderToPipeableStreamOptions & {
  maxHeadersLength?: number;
};

function waitAtLeastOneReactRenderTask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

export async function renderToNodeFizzStream(
  element: ReactNode,
  renderOptions: NodeFizzRenderOptions = {},
  options: { waitForAllReady?: boolean } = {},
): Promise<NodeReadable> {
  const destination = new PassThrough();
  const shellReady = createDeferred<void>();
  const allReady = createDeferred<void>();
  const waitForAllReady = options.waitForAllReady === true;
  const onError = renderOptions.onError;
  let pipeable: PipeableStream | null = null;
  let pipeWhenCreated = false;

  pipeable = renderToPipeableStream(element, {
    ...renderOptions,
    onShellReady() {
      shellReady.resolve();
    },
    onShellError(error) {
      shellReady.reject(error);
      if (waitForAllReady) {
        allReady.reject(error);
      }
    },
    onAllReady() {
      if (waitForAllReady) {
        if (pipeable) {
          pipeable.pipe(destination);
        } else {
          pipeWhenCreated = true;
        }
      }
      allReady.resolve();
    },
    onError(error, errorInfo) {
      return onError?.(error, errorInfo);
    },
  });

  if (pipeWhenCreated) {
    pipeable.pipe(destination);
  }

  if (waitForAllReady) {
    await Promise.all([shellReady.promise, allReady.promise]);
  } else {
    await shellReady.promise;
    await waitAtLeastOneReactRenderTask();
    pipeable.pipe(destination);
  }

  return destination;
}
