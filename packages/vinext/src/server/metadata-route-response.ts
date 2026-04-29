import {
  isValidMetadataImageId,
  manifestToJson,
  matchMetadataRoutePattern,
  robotsToText,
  sitemapToXml,
  type ManifestConfig,
  type MetadataFileRoute,
  type RobotsConfig,
  type SitemapEntry,
} from "./metadata-routes.js";

type AppPageParams = Record<string, string | string[]>;
type MetadataRouteFunction = (props: Record<string, unknown>) => unknown;
type MakeThenableParams = (params: AppPageParams) => unknown;

type MetadataRuntimeRoute = MetadataFileRoute & {
  fileDataBase64?: string;
};

type MetadataRouteRequestOptions = {
  metadataRoutes: readonly MetadataRuntimeRoute[];
  cleanPathname: string;
  makeThenableParams: MakeThenableParams;
};

type MatchedMetadataRoute = {
  params: AppPageParams | null;
  imageId: string | null;
};

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function readFunction(
  module: Record<string, unknown> | undefined,
  key: string,
): MetadataRouteFunction | null {
  if (!module) {
    return null;
  }
  const value = Reflect.get(module, key);
  if (typeof value !== "function") {
    return null;
  }
  return (props) => Reflect.apply(value, module, [props]);
}

function isSitemapEntries(value: unknown): value is SitemapEntry[] {
  return Array.isArray(value);
}

function isRobotsConfig(value: unknown): value is RobotsConfig {
  return isObject(value);
}

function isManifestConfig(value: unknown): value is ManifestConfig {
  return isObject(value);
}

function isImageMetadataRoute(route: MetadataRuntimeRoute): boolean {
  return (
    route.type === "icon" ||
    route.type === "apple-icon" ||
    route.type === "opengraph-image" ||
    route.type === "twitter-image"
  );
}

function hasGeneratedImageMetadata(route: MetadataRuntimeRoute): boolean {
  return (
    route.isDynamic &&
    isImageMetadataRoute(route) &&
    Boolean(readFunction(route.module, "generateImageMetadata"))
  );
}

function matchMetadataRoute(
  route: MetadataRuntimeRoute,
  cleanPathname: string,
): MatchedMetadataRoute | null {
  const routeHasGeneratedImageMetadata = hasGeneratedImageMetadata(route);

  if (route.patternParts) {
    const urlParts = cleanPathname.split("/").filter(Boolean);
    if (routeHasGeneratedImageMetadata && urlParts.length > 0) {
      const params = matchMetadataRoutePattern(urlParts.slice(0, -1), route.patternParts);
      if (params) {
        return {
          params,
          imageId: urlParts[urlParts.length - 1],
        };
      }
    }

    const params = matchMetadataRoutePattern(urlParts, route.patternParts);
    return params ? { params, imageId: null } : null;
  }

  if (routeHasGeneratedImageMetadata && cleanPathname.startsWith(`${route.servedUrl}/`)) {
    const imageSuffix = cleanPathname.slice(route.servedUrl.length + 1);
    if (!imageSuffix || imageSuffix.includes("/")) {
      return null;
    }
    return { params: Object.create(null), imageId: imageSuffix };
  }

  return cleanPathname === route.servedUrl ? { params: null, imageId: null } : null;
}

function findGeneratedSitemapId(entries: unknown, rawId: string): string | null {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (const entry of entries) {
    if (!isObject(entry) || Reflect.get(entry, "id") == null) {
      throw new Error("id property is required for every item returned from generateSitemaps");
    }
    const id = Reflect.get(entry, "id");
    if (String(id) === rawId) {
      return rawId;
    }
  }

  return null;
}

async function handleGeneratedSitemap(
  route: MetadataRuntimeRoute,
  cleanPathname: string,
  generateSitemaps: MetadataRouteFunction,
): Promise<Response | null> {
  const defaultExport = readFunction(route.module, "default");
  if (!defaultExport) {
    return null;
  }

  const sitemapPrefix = route.servedUrl.slice(0, -4);
  if (!cleanPathname.startsWith(`${sitemapPrefix}/`) || !cleanPathname.endsWith(".xml")) {
    return null;
  }

  const rawId = cleanPathname.slice(sitemapPrefix.length + 1, -4);
  if (rawId.includes("/")) {
    return null;
  }

  const matchedId = findGeneratedSitemapId(await generateSitemaps({}), rawId);
  if (!matchedId) {
    return new Response("Not Found", { status: 404 });
  }

  const result = await defaultExport({
    id: Promise.resolve(matchedId),
  });
  if (result instanceof Response) {
    return result;
  }
  if (!isSitemapEntries(result)) {
    throw new TypeError("Metadata sitemap routes must return an array.");
  }
  return new Response(sitemapToXml(result), {
    headers: { "Content-Type": route.contentType },
  });
}

function findGeneratedImageId(
  imageMetadata: unknown,
  imageId: string,
  servedUrl: string,
): string | null {
  if (!Array.isArray(imageMetadata)) {
    return null;
  }

  for (const item of imageMetadata) {
    if (!isObject(item) || Reflect.get(item, "id") == null) {
      throw new Error("id property is required for every item returned from generateImageMetadata");
    }

    const itemId = String(Reflect.get(item, "id"));
    if (!isValidMetadataImageId(itemId)) {
      console.warn(
        `[vinext] Skipping metadata route ${servedUrl} image id "${itemId}" because metadata image ids must match /^[a-zA-Z0-9-_.]+$/.`,
      );
      continue;
    }
    if (itemId === imageId) {
      return itemId;
    }
  }

  return null;
}

async function callDynamicMetadataRoute(
  route: MetadataRuntimeRoute,
  match: MatchedMetadataRoute,
  makeThenableParams: MakeThenableParams,
): Promise<Response> {
  const defaultExport = readFunction(route.module, "default");
  if (!defaultExport) {
    console.warn(`[vinext] Dynamic metadata route ${route.servedUrl} has no default export.`);
    return new Response("Not Found", { status: 404 });
  }

  const paramsThenable = makeThenableParams(match.params ?? {});
  let result: unknown;
  if (hasGeneratedImageMetadata(route)) {
    if (match.imageId === null || !isValidMetadataImageId(match.imageId)) {
      return new Response("Not Found", { status: 404 });
    }

    const generateImageMetadata = readFunction(route.module, "generateImageMetadata");
    if (!generateImageMetadata) {
      return new Response("Not Found", { status: 404 });
    }

    const matchedImageId = findGeneratedImageId(
      await generateImageMetadata({ params: paramsThenable }),
      match.imageId,
      route.servedUrl,
    );
    if (!matchedImageId) {
      return new Response("Not Found", { status: 404 });
    }

    result = await defaultExport({
      params: paramsThenable,
      id: Promise.resolve(matchedImageId),
    });
  } else {
    result = await defaultExport({ params: paramsThenable });
  }

  if (result instanceof Response) {
    return result;
  }

  let body: string;
  if (route.type === "sitemap") {
    if (!isSitemapEntries(result)) {
      throw new TypeError("Metadata sitemap routes must return an array.");
    }
    body = sitemapToXml(result);
  } else if (route.type === "robots") {
    if (!isRobotsConfig(result)) {
      throw new TypeError("Metadata robots routes must return an object.");
    }
    body = robotsToText(result);
  } else if (route.type === "manifest") {
    if (!isManifestConfig(result)) {
      throw new TypeError("Metadata manifest routes must return an object.");
    }
    body = manifestToJson(result);
  } else {
    body = JSON.stringify(result);
  }

  return new Response(body, {
    headers: {
      "Content-Type": route.contentType,
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

function serveStaticMetadataRoute(route: MetadataRuntimeRoute): Response {
  if (typeof route.fileDataBase64 !== "string") {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const binary = atob(route.fileDataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": route.contentType,
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

export async function handleMetadataRouteRequest(
  options: MetadataRouteRequestOptions,
): Promise<Response | null> {
  for (const route of options.metadataRoutes) {
    if (route.type === "sitemap" && route.isDynamic) {
      const generateSitemaps = readFunction(route.module, "generateSitemaps");
      if (generateSitemaps) {
        const generatedSitemapResponse = await handleGeneratedSitemap(
          route,
          options.cleanPathname,
          generateSitemaps,
        );
        if (generatedSitemapResponse) {
          return generatedSitemapResponse;
        }

        continue;
      }
    }

    const match = matchMetadataRoute(route, options.cleanPathname);
    if (!match) {
      continue;
    }

    return route.isDynamic
      ? callDynamicMetadataRoute(route, match, options.makeThenableParams)
      : serveStaticMetadataRoute(route);
  }

  return null;
}
