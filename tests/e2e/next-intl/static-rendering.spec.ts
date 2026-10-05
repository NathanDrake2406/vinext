import { expect, test } from "@playwright/test";

// https://github.com/cloudflare/vinext/issues/3671
// The layout calls setRequestLocale(), which stores the locale through React
// cache(), and server components below it read the locale back through
// getTranslations(). The pre-render probe must see the stored locale, or
// next-intl falls back to headers() and the route is served no-store.
//
// A render stores the HTML and the RSC payload, so the HTML and RSC cases use
// different pages to keep one from warming the other's cache entry.
const cases = [
  { locale: "en", nav: "Home", about: "About", home: "Hello World" },
  { locale: "de", nav: "Startseite", about: "Über", home: "Hallo Welt" },
];

test.describe("next-intl static rendering", () => {
  for (const { locale, nav, about, home } of cases) {
    test(`caches /ssg/${locale}/about after setRequestLocale()`, async ({ request }) => {
      const first = await request.get(`/ssg/${locale}/about`);
      expect(first.status()).toBe(200);
      const html = await first.text();
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(`data-testid="ssg-nav">${nav}<`);
      expect(html).toContain(`data-testid="ssg-title">${about}<`);

      const second = await request.get(`/ssg/${locale}/about`);
      expect(second.status()).toBe(200);
      expect(second.headers()["x-vinext-cache"]).toBe("HIT");
      expect(second.headers()["cache-control"]).not.toContain("no-store");
    });

    // RSC requests also probe the page component before rendering it.
    test(`caches the /ssg/${locale} RSC payload after setRequestLocale()`, async ({ request }) => {
      const first = await request.get(`/ssg/${locale}.rsc`);
      expect(first.status()).toBe(200);
      expect(first.headers()["content-type"]).toContain("text/x-component");
      const payload = await first.text();
      expect(payload).toContain(nav);
      expect(payload).toContain(home);

      const second = await request.get(`/ssg/${locale}.rsc`);
      expect(second.status()).toBe(200);
      expect(second.headers()["x-vinext-cache"]).toBe("HIT");
      expect(second.headers()["cache-control"]).not.toContain("no-store");
    });
  }
});
