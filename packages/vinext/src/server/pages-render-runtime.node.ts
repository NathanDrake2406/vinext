import { Readable, type Readable as NodeReadable } from "node:stream";
import type { ReactNode } from "react";
import { renderToNodeFizzStream } from "./node-fizz-stream.js";

function nodeReadableToWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

async function readNodeStreamAsString(stream: NodeReadable): Promise<string> {
  stream.setEncoding("utf8");
  let html = "";
  for await (const chunk of stream) {
    html += chunk;
  }
  return html;
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
