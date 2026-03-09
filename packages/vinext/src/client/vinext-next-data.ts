/**
 * vinext-specific extensions to Next.js's `NEXT_DATA`.
 *
 * The `next` package declares `Window.__NEXT_DATA__: NEXT_DATA` in its types.
 * We can't augment the `NEXT_DATA` type alias, so we define a superset here
 * and cast at the usage sites.
 */
export interface VinextNextData {
  props: Record<string, any>;
  page: string;
  query: Record<string, string | string[]>;
  isFallback: boolean;
  locale?: string;
  locales?: string[];
  defaultLocale?: string;
  /** vinext-specific additions (not part of Next.js upstream). */
  __vinext?: {
    /** Absolute URL of the page module for dynamic import. */
    pageModuleUrl?: string;
    /** Absolute URL of the `_app` module for dynamic import. */
    appModuleUrl?: string;
  };
  /** Serialised page module path (legacy — used by `client/entry.ts`). */
  __pageModule?: string;
  /** Serialised `_app` module path (legacy — used by `client/entry.ts`). */
  __appModule?: string;
}
