import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Nav } from "./nav";

// Standard next-intl static rendering setup from
// https://github.com/cloudflare/vinext/issues/3671
export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "de" }];
}

export default async function SsgLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Nav />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
