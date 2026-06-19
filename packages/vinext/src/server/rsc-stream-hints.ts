const FLIGHT_HINT_START = ":HL[";
const FLIGHT_STYLESHEET_HINT = ',"stylesheet"';
const FLIGHT_STYLE_HINT = ',"style"';

function hasLineBreakBetween(text: string, start: number, end: number): boolean {
  const newline = text.indexOf("\n", start);
  if (newline !== -1 && newline < end) return true;
  const carriageReturn = text.indexOf("\r", start);
  return carriageReturn !== -1 && carriageReturn < end;
}

/**
 * React Flight emits HL hints with "stylesheet" for CSS preloads, but the
 * HTML spec requires "style" for <link rel="preload">. Rewrite each complete
 * Flight line so SSR embeds, navigation, and server actions see valid hints.
 */
export function rewriteReactFlightStylesheetPreloadHints(text: string): string {
  if (!text.includes('"stylesheet"') || !text.includes(FLIGHT_HINT_START)) return text;

  let rewritten = "";
  let cursor = 0;
  let searchFrom = 0;

  for (;;) {
    const tokenStart = text.indexOf(FLIGHT_STYLESHEET_HINT, searchFrom);
    if (tokenStart === -1) break;

    const tokenEnd = tokenStart + FLIGHT_STYLESHEET_HINT.length;
    const next = text[tokenEnd];
    if (next !== "]" && next !== ",") {
      searchFrom = tokenEnd;
      continue;
    }

    const hintStart = text.lastIndexOf(FLIGHT_HINT_START, tokenStart);
    if (hintStart === -1 || hasLineBreakBetween(text, hintStart, tokenStart)) {
      searchFrom = tokenEnd;
      continue;
    }

    rewritten += text.slice(cursor, tokenStart) + FLIGHT_STYLE_HINT;
    cursor = tokenEnd;
    searchFrom = tokenEnd;
  }

  return cursor === 0 ? text : rewritten + text.slice(cursor);
}

export function normalizeReactFlightPreloadHints(
  stream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const decodedChunk = decoder.decode(chunk, { stream: true });
        if (
          carry === "" &&
          chunk[chunk.length - 1] === 0x0a &&
          (!decodedChunk.includes('"stylesheet"') || !decodedChunk.includes(FLIGHT_HINT_START))
        ) {
          controller.enqueue(chunk);
          return;
        }

        const text = carry + decodedChunk;
        const lastNewline = text.lastIndexOf("\n");

        if (lastNewline === -1) {
          carry = text;
          return;
        }

        carry = text.slice(lastNewline + 1);
        controller.enqueue(
          encoder.encode(rewriteReactFlightStylesheetPreloadHints(text.slice(0, lastNewline + 1))),
        );
      },
      flush(controller) {
        const text = carry + decoder.decode();
        if (text) {
          controller.enqueue(encoder.encode(rewriteReactFlightStylesheetPreloadHints(text)));
        }
      },
    }),
  );
}

export type RscRawRenderer = (model: unknown, options?: unknown) => ReadableStream<Uint8Array>;

export type RscRawPrerenderer = (
  model: unknown,
  options?: unknown,
) => Promise<{ prelude: ReadableStream<Uint8Array> }>;

export function createRscRenderer(render: RscRawRenderer): RscRawRenderer {
  return (model, options) => normalizeReactFlightPreloadHints(render(model, options));
}

export function createRscPrerenderer(prerender: RscRawPrerenderer): RscRawPrerenderer {
  return async (model, options) => {
    const result = await prerender(model, options);
    return { prelude: normalizeReactFlightPreloadHints(result.prelude) };
  };
}
