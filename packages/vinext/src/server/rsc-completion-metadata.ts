import { VINEXT_RSC_COMPLETION_METADATA_HEADER } from "./headers.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FOOTER_MAGIC = encoder.encode("VINEXT_RSC_COMPLETION_V1");
const FOOTER_LENGTH_BYTES = 4;
const MAX_FOOTER_BYTES = 256;

export type RscCompletionMetadata = Readonly<{
  dynamicStaleTimeSeconds: number;
}>;

function isDynamicStaleTimeSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function encodeFooter(metadata: RscCompletionMetadata): Uint8Array {
  const payload = encoder.encode(JSON.stringify(metadata));
  const footer = new Uint8Array(payload.byteLength + FOOTER_LENGTH_BYTES + FOOTER_MAGIC.byteLength);
  footer.set(payload, 0);
  new DataView(footer.buffer).setUint32(payload.byteLength, payload.byteLength);
  footer.set(FOOTER_MAGIC, payload.byteLength + FOOTER_LENGTH_BYTES);
  return footer;
}

function hasMagicAtEnd(bytes: Uint8Array): boolean {
  if (bytes.byteLength < FOOTER_MAGIC.byteLength) return false;
  const offset = bytes.byteLength - FOOTER_MAGIC.byteLength;
  for (let index = 0; index < FOOTER_MAGIC.byteLength; index++) {
    if (bytes[offset + index] !== FOOTER_MAGIC[index]) return false;
  }
  return true;
}

export function extractRscCompletionMetadata(buffer: ArrayBuffer): {
  buffer: ArrayBuffer;
  metadata?: RscCompletionMetadata;
} {
  const bytes = new Uint8Array(buffer);
  if (!hasMagicAtEnd(bytes)) return { buffer };

  const lengthOffset = bytes.byteLength - FOOTER_MAGIC.byteLength - FOOTER_LENGTH_BYTES;
  if (lengthOffset < 0) return { buffer };
  const payloadLength = new DataView(
    bytes.buffer,
    bytes.byteOffset + lengthOffset,
    FOOTER_LENGTH_BYTES,
  ).getUint32(0);
  const payloadOffset = lengthOffset - payloadLength;
  if (payloadOffset < 0) return { buffer };

  try {
    const parsed = JSON.parse(decoder.decode(bytes.subarray(payloadOffset, lengthOffset))) as {
      dynamicStaleTimeSeconds?: unknown;
    };
    if (!isDynamicStaleTimeSeconds(parsed.dynamicStaleTimeSeconds)) return { buffer };
    return {
      buffer: buffer.slice(0, payloadOffset),
      metadata: { dynamicStaleTimeSeconds: parsed.dynamicStaleTimeSeconds },
    };
  } catch {
    return { buffer };
  }
}

export function appendRscCompletionMetadata(
  source: ReadableStream<Uint8Array>,
  getMetadata: () => RscCompletionMetadata | undefined,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read();
      if (!next.done) {
        controller.enqueue(next.value);
        return;
      }
      const metadata = getMetadata();
      if (metadata) controller.enqueue(encodeFooter(metadata));
      controller.close();
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export function stripRscCompletionMetadata(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  let pending = new Uint8Array(0);
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const combined = new Uint8Array(pending.byteLength + chunk.byteLength);
        combined.set(pending, 0);
        combined.set(chunk, pending.byteLength);
        if (combined.byteLength <= MAX_FOOTER_BYTES) {
          pending = combined;
          return;
        }
        const emitLength = combined.byteLength - MAX_FOOTER_BYTES;
        controller.enqueue(combined.slice(0, emitLength));
        pending = combined.slice(emitLength);
      },
      flush(controller) {
        const extracted = extractRscCompletionMetadata(
          pending.buffer.slice(pending.byteOffset, pending.byteOffset + pending.byteLength),
        );
        const remaining = new Uint8Array(extracted.buffer);
        if (remaining.byteLength > 0) controller.enqueue(remaining);
      },
    }),
  );
}

/** Remove vinext's internal completion footer before React reads a Flight response. */
export function stripRscCompletionMetadataResponse(response: Response): Response {
  if (response.headers.get(VINEXT_RSC_COMPLETION_METADATA_HEADER) !== "1" || !response.body) {
    return response;
  }
  return new Response(stripRscCompletionMetadata(response.body), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
