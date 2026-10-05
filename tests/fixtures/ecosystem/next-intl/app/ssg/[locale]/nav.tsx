import { getTranslations } from "next-intl/server";

// Reads the locale from setRequestLocale() in the layout. Without it,
// next-intl falls back to headers() and the route becomes dynamic.
export async function Nav() {
  const t = await getTranslations("Navigation");
  return <nav data-testid="ssg-nav">{t("home")}</nav>;
}
