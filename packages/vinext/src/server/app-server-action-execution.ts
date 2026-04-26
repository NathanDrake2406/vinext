import type { HeadersAccessPhase } from "../shims/headers.js";
import { mergeMiddlewareResponseHeaders } from "./middleware-response-headers.js";
import { validateCsrfOrigin, validateServerActionPayload } from "./request-pipeline.js";

type AppServerActionErrorReporter = (
  error: Error,
  request: { path: string; method: string; headers: Record<string, string> },
  route: { routerKind: "App Router"; routePath: string; routeType: "action" },
) => void;

type AppServerActionDecoder = (body: FormData) => Promise<unknown>;

type ReadFormDataWithLimit = (request: Request, maxBytes: number) => Promise<FormData>;

export type HandleProgressiveServerActionRequestOptions = {
  actionId: string | null;
  allowedOrigins: string[];
  cleanPathname: string;
  clearRequestContext: () => void;
  contentType: string;
  decodeAction: AppServerActionDecoder;
  getAndClearPendingCookies: () => string[];
  getDraftModeCookieHeader: () => string | null | undefined;
  maxActionBodySize: number;
  middlewareHeaders: Headers | null;
  readFormDataWithLimit: ReadFormDataWithLimit;
  reportRequestError: AppServerActionErrorReporter;
  request: Request;
  setHeadersAccessPhase: (phase: HeadersAccessPhase) => HeadersAccessPhase;
};

type ActionRedirect = {
  url: string;
};

function isRequestBodyTooLarge(error: unknown): boolean {
  return error instanceof Error && error.message === "Request body too large";
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function getActionRedirect(error: unknown): ActionRedirect | null {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return null;
  }

  const digest = String(error.digest);
  if (!digest.startsWith("NEXT_REDIRECT;")) {
    return null;
  }

  const parts = digest.split(";");
  const encodedUrl = parts[2];
  if (!encodedUrl) {
    return null;
  }

  return {
    url: decodeURIComponent(encodedUrl),
  };
}

export function isProgressiveServerActionRequest(
  request: Pick<Request, "method">,
  contentType: string,
  actionId: string | null,
): boolean {
  return request.method === "POST" && contentType.startsWith("multipart/form-data") && !actionId;
}

export async function handleProgressiveServerActionRequest(
  options: HandleProgressiveServerActionRequestOptions,
): Promise<Response | null> {
  if (!isProgressiveServerActionRequest(options.request, options.contentType, options.actionId)) {
    return null;
  }

  const csrfResponse = validateCsrfOrigin(options.request, options.allowedOrigins);
  if (csrfResponse) {
    return csrfResponse;
  }

  const contentLength = parseInt(options.request.headers.get("content-length") || "0", 10);
  if (contentLength > options.maxActionBodySize) {
    options.clearRequestContext();
    return new Response("Payload Too Large", { status: 413 });
  }

  try {
    let body: FormData;
    try {
      body = await options.readFormDataWithLimit(options.request, options.maxActionBodySize);
    } catch (error) {
      if (isRequestBodyTooLarge(error)) {
        options.clearRequestContext();
        return new Response("Payload Too Large", { status: 413 });
      }
      throw error;
    }

    const payloadResponse = await validateServerActionPayload(body);
    if (payloadResponse) {
      options.clearRequestContext();
      return payloadResponse;
    }

    const action = await options.decodeAction(body);
    if (typeof action !== "function") {
      return null;
    }

    let actionRedirect: ActionRedirect | null = null;
    const previousHeadersPhase = options.setHeadersAccessPhase("action");
    try {
      await action();
    } catch (error) {
      actionRedirect = getActionRedirect(error);
      if (!actionRedirect) {
        throw error;
      }
    } finally {
      options.setHeadersAccessPhase(previousHeadersPhase);
    }

    if (!actionRedirect) {
      return null;
    }

    const actionPendingCookies = options.getAndClearPendingCookies();
    const actionDraftCookie = options.getDraftModeCookieHeader();
    options.clearRequestContext();

    const redirectHeaders = new Headers({
      Location: new URL(actionRedirect.url, options.request.url).toString(),
    });
    mergeMiddlewareResponseHeaders(redirectHeaders, options.middlewareHeaders);
    for (const cookie of actionPendingCookies) {
      redirectHeaders.append("Set-Cookie", cookie);
    }
    if (actionDraftCookie) {
      redirectHeaders.append("Set-Cookie", actionDraftCookie);
    }

    return new Response(null, { status: 303, headers: redirectHeaders });
  } catch (error) {
    options.getAndClearPendingCookies();
    console.error("[vinext] Server action error:", error);
    options.reportRequestError(
      normalizeError(error),
      {
        path: options.cleanPathname,
        method: options.request.method,
        headers: Object.fromEntries(options.request.headers.entries()),
      },
      { routerKind: "App Router", routePath: options.cleanPathname, routeType: "action" },
    );
    options.clearRequestContext();
    return new Response(
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : "Server action failed: " + getErrorMessage(error),
      { status: 500 },
    );
  }
}
