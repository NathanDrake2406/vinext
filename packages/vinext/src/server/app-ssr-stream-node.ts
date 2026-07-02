import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import {
  createAppHtmlInsertionState,
  type HtmlInsertion,
  type InlineCssManifest,
  type RscEmbedTransform,
} from "./app-ssr-stream.js";

function enqueueStrings(stream: Transform, chunks: string[]): void {
  for (const chunk of chunks) {
    stream.push(Buffer.from(chunk));
  }
}

function toBufferView(chunk: Buffer | Uint8Array | string, encoding: BufferEncoding): Buffer {
  if (typeof chunk === "string") {
    return Buffer.from(chunk, encoding);
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

export function createNodeTickBufferedTransform(
  rscEmbed: RscEmbedTransform,
  injectHTML: HtmlInsertion = "",
  injectAfterHeadOpenHTML: HtmlInsertion = "",
  inlineCssManifest?: InlineCssManifest,
  inlineCssPrependCss = "",
  inlineCssPrependFallbackHTML = "",
  inlineCssScriptNonce?: string,
): Transform {
  const decoder = new StringDecoder("utf8");
  const state = createAppHtmlInsertionState({
    rscEmbed,
    injectHTML,
    injectAfterHeadOpenHTML,
    inlineCssManifest,
    inlineCssPrependCss,
    inlineCssPrependFallbackHTML,
    inlineCssScriptNonce,
  });
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stream = new Transform({
    transform(chunk: Buffer | Uint8Array | string, encoding, callback) {
      state.push(decoder.write(toBufferView(chunk, encoding)));

      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          try {
            enqueueStrings(stream, state.flushTick());
          } catch {
            // The stream may have been destroyed between scheduling and the
            // tick flush. The Web adapter has the same cancellation tolerance.
          }
          timeoutId = null;
        }, 0);
      }

      callback();
    },

    async flush(callback) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const remainder = decoder.end();
      if (remainder) {
        state.push(remainder);
      }

      try {
        enqueueStrings(stream, await state.finish());
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    },
  });

  return stream;
}
