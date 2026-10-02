import { cache } from "react";
import { headers } from "next/headers";

// The shape next-intl's static rendering uses: a layout or page stores the
// locale in a React cache() value, and components below read it, falling back
// to a request header only when nothing was stored.
const getRequestLocaleStore = cache((): { locale: string | undefined } => ({
  locale: undefined,
}));

export function setRequestLocale(locale: string): void {
  getRequestLocaleStore().locale = locale;
}

export async function getRequestLocale(): Promise<string> {
  return getRequestLocaleStore().locale ?? (await headers()).get("x-request-locale") ?? "unset";
}
