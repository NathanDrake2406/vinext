import { createElement as createReactElement } from "react";
import { PassThrough, Readable, type Readable as NodeReadable } from "node:stream";
import {
  renderToPipeableStream,
  renderToStaticMarkup,
  type PipeableStream,
  type RenderToPipeableStreamOptions,
} from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static";
import DefaultGlobalError from "vinext/shims/default-global-error";
import { createNonceAttribute, escapeHtmlAttr } from "./html.js";
import { createNodeTickBufferedTransform } from "./app-ssr-stream-node.js";
import type { AppSsrRenderRuntime, SsrRenderOptions } from "./app-ssr-entry-core.js";

type NodeRenderOptions = RenderToPipeableStreamOptions & {
  maxHeadersLength?: number;
};

function nodeReadableToWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

function createUtf8NodeStream(html: string): NodeReadable {
  return Readable.from([Buffer.from(html)]);
}

function buildBootstrapModuleScript(bootstrapModuleUrl?: string, nonce?: string): string {
  if (!bootstrapModuleUrl) return "";
  return (
    `<script type="module"${createNonceAttribute(nonce)} src="` +
    escapeHtmlAttr(bootstrapModuleUrl) +
    '" id="_R_" async=""></script>'
  );
}

function renderSsrErrorDocumentShell(bootstrapModuleUrl?: string, nonce?: string): NodeReadable {
  const html = renderToStaticMarkup(
    createReactElement(DefaultGlobalError, {
      error: null,
    }),
  ).replace("<style>", '<style data-vinext-error-shell-style="">');
  const bootstrapScript = buildBootstrapModuleScript(bootstrapModuleUrl, nonce);
  if (!bootstrapScript) {
    return createUtf8NodeStream(`<!DOCTYPE html>${html}`);
  }

  const documentClose = "</body></html>";
  if (!html.endsWith(documentClose)) {
    return createUtf8NodeStream(`<!DOCTYPE html>${html}${bootstrapScript}`);
  }

  return createUtf8NodeStream(
    `<!DOCTYPE html>${html.slice(0, -documentClose.length)}${bootstrapScript}${documentClose}`,
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

// Mirrors Next.js's Node Fizz scheduling in
// packages/next/src/server/app-render/stream-ops.node.ts: after the shell is
// ready, let React complete at least one render task before piping bytes.
function waitAtLeastOneReactRenderTask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function renderPipeableHtmlStream(
  element: Parameters<AppSsrRenderRuntime["renderFinalHtmlStream"]>[0]["element"],
  renderOptions: SsrRenderOptions,
  waitForAllReady: boolean,
): Promise<NodeReadable> {
  return new Promise((resolve, reject) => {
    const destination = new PassThrough();
    let pipeable: PipeableStream | null = null;
    let settled = false;

    const settle = (): void => {
      if (settled) return;
      settled = true;
      pipeable?.pipe(destination);
      resolve(destination);
    };

    const onError = renderOptions.onError;
    pipeable = renderToPipeableStream(element, {
      ...(renderOptions as NodeRenderOptions),
      onShellReady() {
        if (!waitForAllReady) {
          waitAtLeastOneReactRenderTask().then(settle, reject);
        }
      },
      onAllReady() {
        if (waitForAllReady) {
          settle();
        }
      },
      onShellError(error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      },
      onError(error) {
        return onError?.(error);
      },
    });
  });
}

export const appSsrNodeRuntime: AppSsrRenderRuntime = {
  renderStaticMarkup(element) {
    return renderToStaticMarkup(element);
  },

  async renderFinalHtmlStream(options) {
    let htmlStream: NodeReadable;
    let shellErrorRecovered = false;

    if (options.pprFallbackShellSignal) {
      const htmlAbortController = new AbortController();
      const pendingHtml = prerenderToNodeStream(options.element, {
        ...(options.renderOptions as NodeRenderOptions),
        signal: htmlAbortController.signal,
      });
      setTimeout(() => htmlAbortController.abort(), 0);
      htmlStream = (await pendingHtml).prelude as unknown as NodeReadable;
    } else {
      try {
        htmlStream = await renderPipeableHtmlStream(
          options.element,
          options.renderOptions,
          options.waitForAllReady,
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
