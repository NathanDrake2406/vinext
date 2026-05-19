import "./server-globals.js";
import type { Route } from "../routing/pages-router.js";
import { mergeRouteParamsIntoQuery, parseQueryString } from "../utils/query.js";
import {
  createPagesReqRes,
  parsePagesApiBody,
  type PagesRequestQuery,
  type PagesReqResRequest,
  type PagesReqResResponse,
  PagesApiBodyParseError,
} from "./pages-node-compat.js";
import { internalServerErrorResponse } from "./http-error-responses.js";

type PagesApiRouteConfig = {
  runtime?: string;
};

type PagesNodeApiRouteHandler = (
  req: PagesReqResRequest,
  res: PagesReqResResponse,
) => void | Promise<void>;

type PagesEdgeApiRouteHandler = (request: Request) => Response | Promise<Response>;

type PagesApiRouteModule = {
  config?: PagesApiRouteConfig;
  default?: PagesNodeApiRouteHandler | PagesEdgeApiRouteHandler;
};

export type PagesApiRouteMatch = {
  params: PagesRequestQuery;
  route: Pick<Route, "pattern"> & {
    module: PagesApiRouteModule;
  };
};

type HandlePagesApiRouteOptions = {
  match: PagesApiRouteMatch | null;
  reportRequestError?: (error: Error, routePattern: string) => void | Promise<void>;
  request: Request;
  url: string;
};

function buildPagesApiQuery(url: string, params: PagesRequestQuery): PagesRequestQuery {
  return mergeRouteParamsIntoQuery(parseQueryString(url), params);
}

function isEdgeApiRuntime(runtime: string | undefined): boolean {
  return runtime === "edge" || runtime === "experimental-edge";
}

function isEdgeApiRouteHandler(
  handler: PagesApiRouteModule["default"],
  module: PagesApiRouteModule,
): handler is PagesEdgeApiRouteHandler {
  return typeof handler === "function" && isEdgeApiRuntime(module.config?.runtime);
}

function isNodeApiRouteHandler(
  handler: PagesApiRouteModule["default"],
  module: PagesApiRouteModule,
): handler is PagesNodeApiRouteHandler {
  return typeof handler === "function" && !isEdgeApiRuntime(module.config?.runtime);
}

export async function handlePagesApiRoute(options: HandlePagesApiRouteOptions): Promise<Response> {
  if (!options.match) {
    return new Response("404 - API route not found", { status: 404 });
  }

  const { route, params } = options.match;
  const handler = route.module.default;
  if (typeof handler !== "function") {
    return new Response("API route does not export a default function", { status: 500 });
  }

  try {
    if (isEdgeApiRouteHandler(handler, route.module)) {
      const response = await handler(options.request);
      if (response instanceof Response) {
        return response;
      }

      throw new Error("Edge API route did not return a Response");
    }

    if (!isNodeApiRouteHandler(handler, route.module)) {
      throw new Error("Unsupported API route runtime");
    }

    const query = buildPagesApiQuery(options.url, params);
    const body = await parsePagesApiBody(options.request);
    const { req, res, responsePromise } = createPagesReqRes({
      body,
      query,
      request: options.request,
      url: options.url,
    });

    await handler(req, res);
    res.end();
    return await responsePromise;
  } catch (error) {
    if (error instanceof PagesApiBodyParseError) {
      return new Response(error.message, {
        status: error.statusCode,
        statusText: error.message,
      });
    }

    void options.reportRequestError?.(
      error instanceof Error ? error : new Error(String(error)),
      route.pattern,
    );
    return internalServerErrorResponse();
  }
}
