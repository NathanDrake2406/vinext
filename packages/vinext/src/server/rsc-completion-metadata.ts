import { VINEXT_RSC_COMPLETION_METADATA_HEADER } from "./headers.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FRAME_ESCAPE_BYTE = 0xff;
const FOOTER_TAG_BYTE = 0x00;
const FOOTER_PREFIX_BYTES = 2;
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
  const footer = new Uint8Array(payload.byteLength + FOOTER_LENGTH_BYTES + FOOTER_PREFIX_BYTES);
  if (footer.byteLength > MAX_FOOTER_BYTES) {
    throw new Error("RSC completion metadata exceeded its framing limit");
  }
  footer[0] = FRAME_ESCAPE_BYTE;
  footer[1] = FOOTER_TAG_BYTE;
  footer.set(payload, FOOTER_PREFIX_BYTES);
  new DataView(footer.buffer).setUint32(
    FOOTER_PREFIX_BYTES + payload.byteLength,
    payload.byteLength,
  );
  return footer;
}

function escapeFlightChunk(chunk: Uint8Array): Uint8Array {
  const firstEscape = chunk.indexOf(FRAME_ESCAPE_BYTE);
  if (firstEscape === -1) return chunk;

  let escapeCount = 1;
  for (let index = firstEscape + 1; index < chunk.byteLength; index++) {
    if (chunk[index] === FRAME_ESCAPE_BYTE) escapeCount++;
  }
  const escaped = new Uint8Array(chunk.byteLength + escapeCount);
  escaped.set(chunk.subarray(0, firstEscape), 0);
  let output = firstEscape;
  for (let index = firstEscape; index < chunk.byteLength; index++) {
    const byte = chunk[index]!;
    escaped[output++] = byte;
    if (byte === FRAME_ESCAPE_BYTE) escaped[output++] = FRAME_ESCAPE_BYTE;
  }
  return escaped;
}

function unescapeFlightPayload(bytes: Uint8Array, end: number, original: ArrayBuffer): ArrayBuffer {
  const firstEscape = bytes.subarray(0, end).indexOf(FRAME_ESCAPE_BYTE);
  if (firstEscape === -1) return end === bytes.byteLength ? original : original.slice(0, end);

  const decoded = new Uint8Array(end);
  decoded.set(bytes.subarray(0, firstEscape), 0);
  let output = firstEscape;
  for (let index = firstEscape; index < end; index++) {
    const byte = bytes[index]!;
    decoded[output++] = byte;
    if (byte === FRAME_ESCAPE_BYTE && bytes[index + 1] === FRAME_ESCAPE_BYTE) index++;
  }
  return decoded.buffer.slice(0, output);
}

export function extractRscCompletionMetadata(buffer: ArrayBuffer): {
  buffer: ArrayBuffer;
  metadata?: RscCompletionMetadata;
} {
  const bytes = new Uint8Array(buffer);
  const lengthOffset = bytes.byteLength - FOOTER_LENGTH_BYTES;
  if (lengthOffset < 0) return { buffer };
  const payloadLength = new DataView(
    bytes.buffer,
    bytes.byteOffset + lengthOffset,
    FOOTER_LENGTH_BYTES,
  ).getUint32(0);
  const footerOffset = lengthOffset - payloadLength - FOOTER_PREFIX_BYTES;
  const hasFooter =
    footerOffset >= 0 &&
    bytes.byteLength - footerOffset <= MAX_FOOTER_BYTES &&
    bytes[footerOffset] === FRAME_ESCAPE_BYTE &&
    bytes[footerOffset + 1] === FOOTER_TAG_BYTE;
  if (!hasFooter) return { buffer: unescapeFlightPayload(bytes, bytes.byteLength, buffer) };
  const payloadOffset = footerOffset + FOOTER_PREFIX_BYTES;

  try {
    const parsed = JSON.parse(decoder.decode(bytes.subarray(payloadOffset, lengthOffset))) as {
      dynamicStaleTimeSeconds?: unknown;
    };
    if (!isDynamicStaleTimeSeconds(parsed.dynamicStaleTimeSeconds)) {
      return { buffer: unescapeFlightPayload(bytes, bytes.byteLength, buffer) };
    }
    return {
      buffer: unescapeFlightPayload(bytes, footerOffset, buffer),
      metadata: { dynamicStaleTimeSeconds: parsed.dynamicStaleTimeSeconds },
    };
  } catch {
    return { buffer: unescapeFlightPayload(bytes, bytes.byteLength, buffer) };
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
        controller.enqueue(escapeFlightChunk(next.value));
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
  let escapePending = false;
  let footerCandidate: number[] | undefined;

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const output: number[] = [];
        const flushOutput = (): void => {
          if (output.length === 0) return;
          controller.enqueue(Uint8Array.from(output));
          output.length = 0;
        };

        let offset = 0;
        while (offset < chunk.byteLength) {
          if (footerCandidate) {
            footerCandidate.push(chunk[offset++]!);
            if (footerCandidate.length > MAX_FOOTER_BYTES) {
              controller.error(new Error("RSC completion metadata exceeded its framing limit"));
              return;
            }
            continue;
          }

          if (escapePending) {
            const escapedByte = chunk[offset++]!;
            escapePending = false;
            if (escapedByte === FRAME_ESCAPE_BYTE) {
              output.push(FRAME_ESCAPE_BYTE);
              continue;
            }
            if (escapedByte === FOOTER_TAG_BYTE) {
              footerCandidate = [FRAME_ESCAPE_BYTE, FOOTER_TAG_BYTE];
              continue;
            }
            controller.error(new Error("Invalid RSC completion metadata escape sequence"));
            return;
          }

          const escapeOffset = chunk.indexOf(FRAME_ESCAPE_BYTE, offset);
          if (escapeOffset === -1) {
            flushOutput();
            controller.enqueue(chunk.subarray(offset));
            return;
          }
          if (escapeOffset > offset) {
            flushOutput();
            controller.enqueue(chunk.subarray(offset, escapeOffset));
          }
          escapePending = true;
          offset = escapeOffset + 1;
        }
        flushOutput();
      },
      flush(controller) {
        if (escapePending) {
          controller.error(new Error("Truncated RSC completion metadata escape sequence"));
          return;
        }
        if (footerCandidate) {
          const candidate = Uint8Array.from(footerCandidate);
          const extracted = extractRscCompletionMetadata(candidate.buffer);
          if (extracted.metadata === undefined || extracted.buffer.byteLength !== 0) {
            controller.error(new Error("Invalid or truncated RSC completion metadata footer"));
          }
        }
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
