import type { NextI18nConfig } from "../config/next-config.js";

export type DomainLocale = NonNullable<NextI18nConfig["domains"]>[number];

export function normalizeDomainHostname(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  return hostname.split(",", 1)[0]?.trim().split(":", 1)[0]?.toLowerCase() || undefined;
}

/**
 * Match a configured domain either by hostname or locale.
 * When both are provided, the checks intentionally use OR semantics so the
 * same helper can cover Next.js's hostname lookup and preferred-locale lookup.
 */
export function detectDomainLocale(
  domainItems?: readonly DomainLocale[],
  hostname?: string,
  detectedLocale?: string,
): DomainLocale | undefined {
  if (!domainItems?.length) return undefined;

  const normalizedHostname = normalizeDomainHostname(hostname);
  const normalizedLocale = detectedLocale?.toLowerCase();

  for (const item of domainItems) {
    const domainHostname = normalizeDomainHostname(item.domain);
    if (
      normalizedHostname === domainHostname ||
      normalizedLocale === item.defaultLocale.toLowerCase() ||
      item.locales?.some((locale) => locale.toLowerCase() === normalizedLocale)
    ) {
      return item;
    }
  }

  return undefined;
}

export function addLocalePrefix(path: string, locale: string, localeDefault: string): string {
  if (locale === localeDefault) return path;
  if (path.startsWith(`/${locale}/`) || path === `/${locale}`) return path;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

function withBasePath(path: string, basePath = ""): string {
  if (!basePath) return path;
  return basePath + path;
}

export function getDomainLocaleUrl(
  url: string,
  locale: string,
  {
    basePath,
    currentHostname,
    domainItems,
  }: {
    basePath?: string;
    currentHostname?: string | null;
    domainItems?: readonly DomainLocale[];
  },
): string | undefined {
  if (!domainItems?.length) return undefined;

  const targetDomain = detectDomainLocale(domainItems, undefined, locale);
  if (!targetDomain) return undefined;

  const currentDomain = detectDomainLocale(domainItems, currentHostname ?? undefined);
  const localizedPath = addLocalePrefix(url, locale, targetDomain.defaultLocale);

  if (
    currentDomain &&
    normalizeDomainHostname(currentDomain.domain) === normalizeDomainHostname(targetDomain.domain)
  ) {
    // Same-domain locale switches stay relative so the caller can keep treating
    // them as internal navigation and apply its usual basePath/history flow.
    return localizedPath;
  }

  const scheme = `http${targetDomain.http ? "" : "s"}://`;
  return `${scheme}${targetDomain.domain}${withBasePath(localizedPath, basePath)}`;
}
