import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function SsgAboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Navigation");

  return <h1 data-testid="ssg-title">{t("about")}</h1>;
}
