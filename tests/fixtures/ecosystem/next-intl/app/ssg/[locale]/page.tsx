import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function SsgHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");

  return <h1 data-testid="ssg-title">{t("title")}</h1>;
}
