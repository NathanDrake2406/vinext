import type { NextI18nConfig } from "../config/next-config.js";

export type DomainLocale = NonNullable<NextI18nConfig["domains"]>[number];

export function normalizeDomainHostname(hostname: string | null | undefined): string | undefined {
  if (!hostname) return undefined;
  return hostname.split(",", 1)[0]?.trim().split(":", 1)[0]?.toLowerCase() || undefined;
}

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
