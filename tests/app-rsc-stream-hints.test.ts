import { describe, expect, it } from "vitest";
import {
  normalizeReactFlightPreloadHints,
  rewriteReactFlightStylesheetPreloadHints,
} from "../packages/vinext/src/server/rsc-stream-hints.js";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }

  return text + decoder.decode();
}

describe("RSC stream hint helpers", () => {
  it("rewrites stylesheet hints without touching non-HL stylesheet payloads", () => {
    expect(rewriteReactFlightStylesheetPreloadHints(':HL["/a.css","stylesheet"]')).toBe(
      ':HL["/a.css","style"]',
    );
    expect(
      rewriteReactFlightStylesheetPreloadHints(
        '0:D{"name":"page"}\n1:["$","link",null,{"rel":"stylesheet"}]\n',
      ),
    ).toBe('0:D{"name":"page"}\n1:["$","link",null,{"rel":"stylesheet"}]\n');
    expect(
      rewriteReactFlightStylesheetPreloadHints(':HL["/a.css","font"]\n0:D"stylesheet"\n'),
    ).toBe(':HL["/a.css","font"]\n0:D"stylesheet"\n');
  });

  it("rewrites React Flight stylesheet preload hints", async () => {
    const stream = normalizeReactFlightPreloadHints(
      streamFromChunks([
        ':HL["/assets/app.css","stylesheet"]\n',
        '2:HL["/assets/page.css","stylesheet",{"crossOrigin":""}]\n',
        '3:HL["/assets/font.woff2","font"]\n',
      ]),
    );

    await expect(readStream(stream)).resolves.toBe(
      ':HL["/assets/app.css","style"]\n' +
        '2:HL["/assets/page.css","style",{"crossOrigin":""}]\n' +
        '3:HL["/assets/font.woff2","font"]\n',
    );
  });

  it("only rewrites stylesheet preload hints in mixed Flight content", async () => {
    const stream = normalizeReactFlightPreloadHints(
      streamFromChunks([
        '0:D{"name":"page"}\n' +
          ':HL["/assets/a.css","stylesheet",{"crossOrigin":""}]\n' +
          '1:["$","link",null,{"rel":"stylesheet","href":"/assets/b.css"}]\n' +
          ':HL["/assets/c.css","style"]\n' +
          ':HL["/assets/d.css","stylesheet"]\n',
      ]),
    );

    await expect(readStream(stream)).resolves.toBe(
      '0:D{"name":"page"}\n' +
        ':HL["/assets/a.css","style",{"crossOrigin":""}]\n' +
        '1:["$","link",null,{"rel":"stylesheet","href":"/assets/b.css"}]\n' +
        ':HL["/assets/c.css","style"]\n' +
        ':HL["/assets/d.css","style"]\n',
    );
  });

  it("buffers partial Flight lines across chunks before rewriting hints", async () => {
    const stream = normalizeReactFlightPreloadHints(
      streamFromChunks([':HL["/assets/app.css",', '"styles', 'heet"]\n0:D{"name":"page"}\n']),
    );

    await expect(readStream(stream)).resolves.toBe(
      ':HL["/assets/app.css","style"]\n0:D{"name":"page"}\n',
    );
  });

  it("rewrites a final unterminated Flight line during flush", async () => {
    const stream = normalizeReactFlightPreloadHints(
      streamFromChunks([':HL["/assets/app.css","stylesheet"]']),
    );

    await expect(readStream(stream)).resolves.toBe(':HL["/assets/app.css","style"]');
  });

  it("passes through complete unchanged chunks without re-encoding", async () => {
    const chunk = new TextEncoder().encode('0:D{"name":"page"}\n3:HL["/font.woff2","font"]\n');
    const stream = normalizeReactFlightPreloadHints(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    );

    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(first.value).toBe(chunk);
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it("does not duplicate split UTF-8 bytes when an unchanged chunk is incomplete", async () => {
    const stream = normalizeReactFlightPreloadHints(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0x30, 0x3a, 0x44, 0x22, 0xc3]));
          controller.enqueue(new Uint8Array([0xa9, 0x22]));
          controller.close();
        },
      }),
    );

    await expect(readStream(stream)).resolves.toBe('0:D"é"');
  });
});
