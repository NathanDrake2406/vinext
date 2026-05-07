import type { Metadata } from "next";

type CountBody = {
  count: number;
};

async function fetchProduct(): Promise<CountBody> {
  const target = process.env.TEST_FETCH_DEDUPE_TARGET;
  if (!target) {
    throw new Error("missing TEST_FETCH_DEDUPE_TARGET");
  }

  const response = await fetch(target, { cache: "no-store" });
  return (await response.json()) as CountBody;
}

export async function generateMetadata(): Promise<Metadata> {
  const product = await fetchProduct();
  return {
    title: `Product ${product.count}`,
  };
}

export default async function FetchDedupeMetadataPage() {
  const product = await fetchProduct();

  return (
    <main>
      <h1>Fetch Dedupe Metadata</h1>
      <p data-testid="fetch-dedupe-metadata-count">{product.count}</p>
    </main>
  );
}
