import { Readable, type Readable as NodeReadable } from "node:stream";
import { renderSsrErrorDocumentShellHtml } from "./app-ssr-error-shell.js";
import { createNodeTickBufferedTransform } from "./app-ssr-stream-node.js";
import type { AppSsrRenderRuntime } from "./app-ssr-entry-core.js";
import {
  prerenderToNodeFizzStream,
  renderToNodeFizzStream,
  renderToNodeStaticMarkup,
  type NodeFizzRenderOptions,
} from "./node-fizz-stream.js";

function nodeReadableToWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function createUtf8NodeStream(html: string): NodeReadable {
  return Readable.from([Buffer.from(html)]);
}

function renderSsrErrorDocumentShell(bootstrapModuleUrl?: string, nonce?: string): NodeReadable {
  return createUtf8NodeStream(
    renderSsrErrorDocumentShellHtml(renderToNodeStaticMarkup, bootstrapModuleUrl, nonce),
  );
}

function transformNodeHtmlStream(
  htmlStream: NodeReadable,
  options: Parameters<AppSsrRenderRuntime["renderFinalHtmlStream"]>[0]["transform"],
): NodeReadable {
  return htmlStream.pipe(
    createNodeTickBufferedTransform(
      options.rscEmbed,
      options.injectHTML,
      options.injectAfterHeadOpenHTML,
      options.inlineCssManifest,
      options.inlineCssPrependCss,
      options.inlineCssPrependFallbackHTML,
      options.inlineCssScriptNonce,
    ),
  );
}

export const appSsrNodeRuntime: AppSsrRenderRuntime = {
  renderStaticMarkup(element) {
    return renderToNodeStaticMarkup(element);
  },

  async renderFinalHtmlStream(options) {
    let htmlStream: NodeReadable;
    let shellErrorRecovered = false;

    if (options.pprFallbackShellSignal) {
      const htmlAbortController = new AbortController();
      const pendingHtml = prerenderToNodeFizzStream(options.element, {
        ...(options.renderOptions as NodeFizzRenderOptions),
        signal: htmlAbortController.signal,
      });
      setTimeout(() => htmlAbortController.abort(), 0);
      htmlStream = (await pendingHtml).prelude as unknown as NodeReadable;
    } else {
      try {
        htmlStream = await renderToNodeFizzStream(
          options.element,
          options.renderOptions as NodeFizzRenderOptions,
          { waitForAllReady: options.waitForAllReady },
        );
      } catch (error) {
        if (!options.shouldRecoverShellError(error)) {
          throw error;
        }
        shellErrorRecovered = true;
        htmlStream = renderSsrErrorDocumentShell(options.bootstrapModuleUrl, options.scriptNonce);
      }
    }

    return {
      htmlStream: nodeReadableToWeb(transformNodeHtmlStream(htmlStream, options.transform)),
      shellErrorRecovered,
    };
  },
};
