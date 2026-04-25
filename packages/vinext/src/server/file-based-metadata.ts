import type { Metadata } from "../shims/metadata.js";
import type { MetadataFileRoute, MetadataRouteHeadData } from "./metadata-routes.js";

type AppPageParams = Record<string, string | string[]>;

type IconEntry = {
  url: string | URL;
  sizes?: string;
  type?: string;
  media?: string;
};

type AppleIconEntry = {
  url: string | URL;
  sizes?: string;
  type?: string;
};

type SocialImageEntry = {
  url: string | URL;
  width?: number;
  height?: number;
  alt?: string;
  type?: string;
};

type DynamicImageSize = {
  width?: number;
  height?: number;
};

type DynamicImageMetadataSource = {
  id?: string | number;
  alt?: string;
  contentType?: string;
  size?: DynamicImageSize;
};

function getRoutePrefix(route: MetadataFileRoute): string {
  return route.routePrefix;
}

function routeApplies(routePath: string, routePrefix: string): boolean {
  if (!routePrefix) {
    return true;
  }
  return routePath === routePrefix || routePath.startsWith(`${routePrefix}/`);
}

function routeScore(routePrefix: string): number {
  return routePrefix.split("/").filter(Boolean).length;
}

function normalizeRoutePrefixPattern(routePrefix: string): string {
  const segments = routePrefix
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith("[[...") && segment.endsWith("]]")) {
        return `:${segment.slice(5, -2)}*`;
      }
      if (segment.startsWith("[...") && segment.endsWith("]")) {
        return `:${segment.slice(4, -1)}+`;
      }
      if (segment.startsWith("[") && segment.endsWith("]")) {
        return `:${segment.slice(1, -1)}`;
      }
      return segment;
    });

  return segments.length > 0 ? `/${segments.join("/")}` : "";
}

function selectDeepestRoutes(
  metadataRoutes: MetadataFileRoute[],
  kind: MetadataRouteHeadData["kind"],
  routePath: string,
  params: AppPageParams,
): MetadataFileRoute[] {
  let selectedScore = -1;
  const selectedRoutes: MetadataFileRoute[] = [];

  for (const route of metadataRoutes) {
    const routeKind =
      route.headData?.kind ??
      (route.type === "icon"
        ? "icon"
        : route.type === "apple-icon"
          ? "apple"
          : route.type === "opengraph-image"
            ? "openGraph"
            : route.type === "twitter-image"
              ? "twitter"
              : route.type === "manifest"
                ? "manifest"
                : route.type === "favicon"
                  ? "favicon"
                  : null);

    if (routeKind !== kind) {
      continue;
    }

    const routePrefix = getRoutePrefix(route);
    const resolvedRoutePrefix = fillMetadataRouteSegments(routePrefix, params);
    const normalizedRoutePrefix = normalizeRoutePrefixPattern(routePrefix);
    if (
      !routeApplies(routePath, routePrefix) &&
      !routeApplies(routePath, normalizedRoutePrefix) &&
      !routeApplies(routePath, resolvedRoutePrefix)
    ) {
      continue;
    }

    const currentScore = routeScore(routePrefix);
    if (currentScore > selectedScore) {
      selectedScore = currentScore;
      selectedRoutes.length = 0;
      selectedRoutes.push(route);
      continue;
    }

    if (currentScore === selectedScore) {
      selectedRoutes.push(route);
    }
  }

  return selectedRoutes;
}

function normalizeIconEntries(icon: NonNullable<Metadata["icons"]>): IconEntry[] {
  if (!icon || typeof icon !== "object") {
    return [];
  }

  const iconValue = icon.icon;
  if (!iconValue) {
    return [];
  }
  if (typeof iconValue === "string" || iconValue instanceof URL) {
    return [{ url: iconValue }];
  }
  return [...iconValue];
}

function buildIconEntry(headData: MetadataRouteHeadData): IconEntry | null {
  if (headData.kind !== "favicon" && headData.kind !== "icon") {
    return null;
  }

  const iconEntry: IconEntry = {
    url: headData.href,
  };
  if (headData.sizes) {
    iconEntry.sizes = headData.sizes;
  }
  if (headData.type) {
    iconEntry.type = headData.type;
  }
  return iconEntry;
}

function buildAppleEntry(headData: MetadataRouteHeadData): AppleIconEntry | null {
  if (headData.kind !== "apple") {
    return null;
  }

  const appleEntry: AppleIconEntry = {
    url: headData.href,
  };
  if (headData.sizes) {
    appleEntry.sizes = headData.sizes;
  }
  if (headData.type) {
    appleEntry.type = headData.type;
  }
  return appleEntry;
}

function buildSocialEntry(headData: MetadataRouteHeadData): SocialImageEntry | null {
  if (headData.kind !== "openGraph" && headData.kind !== "twitter") {
    return null;
  }

  const socialEntry: SocialImageEntry = {
    url: headData.href,
  };
  if (headData.width !== undefined) {
    socialEntry.width = headData.width;
  }
  if (headData.height !== undefined) {
    socialEntry.height = headData.height;
  }
  if (headData.alt) {
    socialEntry.alt = headData.alt;
  }
  if (headData.type) {
    socialEntry.type = headData.type;
  }
  return socialEntry;
}

function appendParamValue(target: string[], value: string | string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      target.push(entry);
    }
    return;
  }

  target.push(value);
}

function fillMetadataRouteSegments(servedUrl: string, params: AppPageParams): string {
  const segments = servedUrl.split("/").filter(Boolean);
  const resolvedSegments: string[] = [];

  for (const segment of segments) {
    if (segment.startsWith("[[...") && segment.endsWith("]]")) {
      const paramName = segment.slice(5, -2);
      const value = params[paramName];
      if (value !== undefined) {
        appendParamValue(resolvedSegments, value);
      }
      continue;
    }

    if (segment.startsWith("[...") && segment.endsWith("]")) {
      const paramName = segment.slice(4, -1);
      const value = params[paramName];
      if (value === undefined) {
        return servedUrl;
      }
      appendParamValue(resolvedSegments, value);
      continue;
    }

    if (segment.startsWith("[") && segment.endsWith("]")) {
      const paramName = segment.slice(1, -1);
      const value = params[paramName];
      if (typeof value === "string") {
        resolvedSegments.push(value);
        continue;
      }
      if (Array.isArray(value) && value.length > 0) {
        resolvedSegments.push(value[0]);
        continue;
      }
      return servedUrl;
    }

    resolvedSegments.push(segment);
  }

  return resolvedSegments.length > 0 ? `/${resolvedSegments.join("/")}` : "/";
}

function withContentHash(href: string, contentHash?: string): string {
  if (!contentHash) {
    return href;
  }
  return `${href}?${contentHash}`;
}

function readStringProperty(source: object, key: string): string | undefined {
  const value = Reflect.get(source, key);
  return typeof value === "string" ? value : undefined;
}

function readNumberProperty(source: object, key: string): number | undefined {
  const value = Reflect.get(source, key);
  return typeof value === "number" ? value : undefined;
}

function readStringOrNumberProperty(source: object, key: string): string | number | undefined {
  const value = Reflect.get(source, key);
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function readSizeProperty(source: object): DynamicImageSize | undefined {
  const sizeValue = Reflect.get(source, "size");
  if (typeof sizeValue !== "object" || sizeValue === null) {
    return undefined;
  }

  const width = readNumberProperty(sizeValue, "width");
  const height = readNumberProperty(sizeValue, "height");
  if (width === undefined && height === undefined) {
    return undefined;
  }

  return { width, height };
}

function readDynamicImageMetadataSource(source: object): DynamicImageMetadataSource {
  return {
    id: readStringOrNumberProperty(source, "id"),
    alt: readStringProperty(source, "alt"),
    contentType: readStringProperty(source, "contentType"),
    size: readSizeProperty(source),
  };
}

async function resolveDynamicImageMetadataSources(
  route: MetadataFileRoute,
  params: AppPageParams,
): Promise<DynamicImageMetadataSource[]> {
  if (!route.module || typeof route.module !== "object") {
    return [];
  }

  const generateImageMetadata = Reflect.get(route.module, "generateImageMetadata");
  if (typeof generateImageMetadata !== "function") {
    return [readDynamicImageMetadataSource(route.module)];
  }

  const result = await generateImageMetadata({ params: Promise.resolve(params) });
  if (!Array.isArray(result)) {
    return [];
  }

  const sources: DynamicImageMetadataSource[] = [];
  for (const entry of result) {
    if (typeof entry === "object" && entry !== null) {
      sources.push(readDynamicImageMetadataSource(entry));
    }
  }
  return sources;
}

async function resolveRouteHeadData(
  route: MetadataFileRoute,
  params: AppPageParams,
): Promise<MetadataRouteHeadData[]> {
  if (!route.isDynamic || !route.module || typeof route.module !== "object") {
    return route.headData ? [route.headData] : [];
  }

  if (
    route.type !== "icon" &&
    route.type !== "apple-icon" &&
    route.type !== "opengraph-image" &&
    route.type !== "twitter-image"
  ) {
    return route.headData ? [route.headData] : [];
  }

  const resolvedUrl = fillMetadataRouteSegments(route.servedUrl, params);
  const metadataSources = await resolveDynamicImageMetadataSources(route, params);
  const resolvedHeadData: MetadataRouteHeadData[] = [];

  for (const metadataSource of metadataSources) {
    const hrefBase =
      metadataSource.id !== undefined ? `${resolvedUrl}/${String(metadataSource.id)}` : resolvedUrl;
    const href = withContentHash(hrefBase, route.contentHash);
    const contentType = metadataSource.contentType ?? route.contentType;
    const size = metadataSource.size;

    if (route.type === "icon" || route.type === "apple-icon") {
      let sizes: string | undefined;
      if (size?.width !== undefined && size.height !== undefined) {
        sizes = `${size.width}x${size.height}`;
      }

      resolvedHeadData.push({
        kind: route.type === "apple-icon" ? "apple" : "icon",
        href,
        sizes,
        type: contentType,
      });
      continue;
    }

    resolvedHeadData.push({
      kind: route.type === "opengraph-image" ? "openGraph" : "twitter",
      href,
      alt: metadataSource.alt,
      height: size?.height,
      type: contentType,
      width: size?.width,
    });
  }

  return resolvedHeadData;
}

async function resolveHeadDataList(
  routes: MetadataFileRoute[],
  params: AppPageParams,
): Promise<MetadataRouteHeadData[]> {
  const headDataList: MetadataRouteHeadData[] = [];

  for (const route of routes) {
    const routeHeadData = await resolveRouteHeadData(route, params);
    for (const headData of routeHeadData) {
      headDataList.push(headData);
    }
  }

  return headDataList;
}

export async function applyFileBasedMetadata(
  metadata: Metadata | null,
  routePath: string,
  params: AppPageParams,
  metadataRoutes: MetadataFileRoute[],
): Promise<Metadata | null> {
  const faviconRoutes = selectDeepestRoutes(metadataRoutes, "favicon", routePath, params);
  const iconRoutes = selectDeepestRoutes(metadataRoutes, "icon", routePath, params);
  const appleRoutes = selectDeepestRoutes(metadataRoutes, "apple", routePath, params);
  const openGraphRoutes = selectDeepestRoutes(metadataRoutes, "openGraph", routePath, params);
  const twitterRoutes = selectDeepestRoutes(metadataRoutes, "twitter", routePath, params);
  const manifestRoutes = selectDeepestRoutes(metadataRoutes, "manifest", routePath, params);

  const [
    faviconHeadData,
    iconHeadData,
    appleHeadData,
    openGraphHeadData,
    twitterHeadData,
    manifestHeadData,
  ] = await Promise.all([
    resolveHeadDataList(faviconRoutes, params),
    resolveHeadDataList(iconRoutes, params),
    resolveHeadDataList(appleRoutes, params),
    resolveHeadDataList(openGraphRoutes, params),
    resolveHeadDataList(twitterRoutes, params),
    resolveHeadDataList(manifestRoutes, params),
  ]);

  if (
    !metadata &&
    faviconHeadData.length === 0 &&
    iconHeadData.length === 0 &&
    appleHeadData.length === 0 &&
    openGraphHeadData.length === 0 &&
    twitterHeadData.length === 0 &&
    manifestHeadData.length === 0
  ) {
    return null;
  }

  const nextMetadata: Metadata = metadata ? structuredClone(metadata) : {};
  const hadExplicitIcons = Boolean(metadata?.icons);

  const faviconEntries: IconEntry[] = [];
  for (const headData of faviconHeadData) {
    const iconEntry = buildIconEntry(headData);
    if (iconEntry) {
      faviconEntries.push(iconEntry);
    }
  }
  if (faviconEntries.length > 0) {
    const nextIcons: NonNullable<Metadata["icons"]> = nextMetadata.icons
      ? { ...nextMetadata.icons }
      : {};
    const normalizedIcons = normalizeIconEntries(nextIcons);
    nextIcons.icon = [...faviconEntries, ...normalizedIcons];
    nextMetadata.icons = nextIcons;
  }

  if (!hadExplicitIcons) {
    const nextIcons: NonNullable<Metadata["icons"]> = nextMetadata.icons
      ? { ...nextMetadata.icons }
      : {};

    const iconEntries: IconEntry[] = [];
    for (const headData of iconHeadData) {
      const iconEntry = buildIconEntry(headData);
      if (iconEntry) {
        iconEntries.push(iconEntry);
      }
    }
    if (iconEntries.length > 0) {
      const normalizedIcons = normalizeIconEntries(nextIcons);
      nextIcons.icon = [...normalizedIcons, ...iconEntries];
    }

    const appleEntries: AppleIconEntry[] = [];
    for (const headData of appleHeadData) {
      const appleEntry = buildAppleEntry(headData);
      if (appleEntry) {
        appleEntries.push(appleEntry);
      }
    }
    if (appleEntries.length > 0) {
      nextIcons.apple = appleEntries;
    }

    if (nextIcons.icon || nextIcons.apple) {
      nextMetadata.icons = nextIcons;
    }
  }

  if (!nextMetadata.openGraph?.images && openGraphHeadData.length > 0) {
    const socialEntries: SocialImageEntry[] = [];
    for (const headData of openGraphHeadData) {
      const socialEntry = buildSocialEntry(headData);
      if (socialEntry) {
        socialEntries.push(socialEntry);
      }
    }
    if (socialEntries.length > 0) {
      const nextOpenGraph: NonNullable<Metadata["openGraph"]> = nextMetadata.openGraph
        ? { ...nextMetadata.openGraph }
        : {};
      nextOpenGraph.images = socialEntries;
      nextMetadata.openGraph = nextOpenGraph;
    }
  }

  if (!nextMetadata.twitter?.images && twitterHeadData.length > 0) {
    const socialEntries: SocialImageEntry[] = [];
    for (const headData of twitterHeadData) {
      const socialEntry = buildSocialEntry(headData);
      if (socialEntry) {
        socialEntries.push(socialEntry);
      }
    }
    if (socialEntries.length > 0) {
      const nextTwitter: NonNullable<Metadata["twitter"]> = nextMetadata.twitter
        ? { ...nextMetadata.twitter }
        : {};
      nextTwitter.images = socialEntries;
      nextMetadata.twitter = nextTwitter;
    }
  }

  if (
    !nextMetadata.manifest &&
    manifestHeadData.length > 0 &&
    manifestHeadData[0].kind === "manifest"
  ) {
    nextMetadata.manifest = manifestHeadData[0].href;
  }

  return nextMetadata;
}
