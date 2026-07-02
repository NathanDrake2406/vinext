import { Readable, type Readable as NodeReadable } from "node:stream";
import type { ReactNode } from "react";
import { renderToNodeFizzStream } from "./node-fizz-stream.js";

function nodeReadableToWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function toBufferView(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new TypeError("[vinext] Node render stream emitted a non-byte chunk.");
}

async function readNodeStreamAsString(stream: NodeReadable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(toBufferView(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function renderPagesToReadableStream(
  element: ReactNode,
): Promise<ReadableStream<Uint8Array>> {
  return nodeReadableToWeb(await renderToNodeFizzStream(element));
}

export async function renderPagesToString(element: ReactNode): Promise<string> {
  return readNodeStreamAsString(
    await renderToNodeFizzStream(element, {}, { waitForAllReady: true }),
  );
}
