import { PassThrough } from "node:stream";
import type { PipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { abortReactWorkWhenConsumerCloses } from "../packages/vinext/src/server/node-fizz-stream.js";

describe("abortReactWorkWhenConsumerCloses", () => {
  it("aborts React work when the consumer destroys the Node stream", async () => {
    const destination = new PassThrough();
    const pipeable = { abort: vi.fn() } as unknown as PipeableStream;

    abortReactWorkWhenConsumerCloses(destination, () => pipeable);
    destination.destroy();

    await new Promise<void>((resolve) => {
      destination.once("close", () => resolve());
    });

    expect(pipeable.abort).toHaveBeenCalledTimes(1);
  });

  it("does not abort React work after the Node stream completes", async () => {
    const destination = new PassThrough();
    const pipeable = { abort: vi.fn() } as unknown as PipeableStream;

    abortReactWorkWhenConsumerCloses(destination, () => pipeable);
    destination.end("ok");
    destination.resume();

    await new Promise<void>((resolve) => {
      destination.once("close", () => resolve());
    });

    expect(pipeable.abort).not.toHaveBeenCalled();
  });
});
