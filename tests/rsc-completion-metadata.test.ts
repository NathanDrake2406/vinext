import { describe, expect, it } from "vite-plus/test";
import {
  appendRscCompletionMetadata,
  extractRscCompletionMetadata,
  stripRscCompletionMetadata,
} from "../packages/vinext/src/server/rsc-completion-metadata.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function stream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("RSC completion metadata", () => {
  it("appends and extracts the completed dynamic stale bound", async () => {
    const body = appendRscCompletionMetadata(stream(["flight-", "payload"]), () => ({
      dynamicStaleTimeSeconds: 0,
    }));
    const encoded = await new Response(body).arrayBuffer();
    const extracted = extractRscCompletionMetadata(encoded);

    expect(decoder.decode(extracted.buffer)).toBe("flight-payload");
    expect(extracted.metadata).toEqual({ dynamicStaleTimeSeconds: 0 });
  });

  it("strips the footer without exposing it to the Flight decoder stream", async () => {
    const body = appendRscCompletionMetadata(stream(["a".repeat(300), "tail"]), () => ({
      dynamicStaleTimeSeconds: 12,
    }));
    const stripped = stripRscCompletionMetadata(body);

    await expect(new Response(stripped).text()).resolves.toBe(`${"a".repeat(300)}tail`);
  });

  it("passes a static completed stream through byte-for-byte", async () => {
    const body = appendRscCompletionMetadata(stream(["static-flight"]), () => undefined);
    const encoded = await new Response(body).arrayBuffer();
    const extracted = extractRscCompletionMetadata(encoded);

    expect(decoder.decode(extracted.buffer)).toBe("static-flight");
    expect(extracted.metadata).toBeUndefined();
  });
});
