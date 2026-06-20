const FLIGHT_HINT_START = ":HL[";
const REACT_FLIGHT_STYLESHEET_PRELOAD_HINT = /(\d*:HL\[.*?),"stylesheet"(\]|,)/g;

/**
 * React Flight emits HL hints with "stylesheet" for CSS preloads, but the
 * HTML spec requires "style" for <link rel="preload">. Rewrite each complete
 * Flight line so SSR embeds, navigation, and server actions see valid hints.
 */
export function rewriteReactFlightStylesheetPreloadHints(text: string): string {
  if (!text.includes('"stylesheet"') || !text.includes(FLIGHT_HINT_START)) return text;
  return text.replace(REACT_FLIGHT_STYLESHEET_PRELOAD_HINT, '$1,"style"$2');
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
          encoder.encode(
            text
              .slice(0, lastNewline + 1)
              .replace(REACT_FLIGHT_STYLESHEET_PRELOAD_HINT, '$1,"style"$2'),
          ),
        );
      },
      flush(controller) {
        const text = carry + decoder.decode();
        if (text) {
          controller.enqueue(
            encoder.encode(text.replace(REACT_FLIGHT_STYLESHEET_PRELOAD_HINT, '$1,"style"$2')),
          );
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
