import { Suspense } from "react";
import { FilterControls } from "./FilterControls";

async function SearchResults({ query, delayMs }: { query: string; delayMs: number }) {
  await new Promise((r) => setTimeout(r, delayMs));
  if (!query) {
    return <p id="search-results">Enter a search query</p>;
  }
  return <p id="search-results">Results for: {query}</p>;
}

export default async function QuerySyncPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; delay?: string }>;
}) {
  const { q = "", delay } = await searchParams;
  const delayMs = delay === "slow" ? 5_000 : 200;
  return (
    <div>
      <h1 id="query-title">{q ? `Search: ${q}` : "Search"}</h1>
      <FilterControls />
      <Suspense fallback={<div id="query-loading">Searching...</div>}>
        <SearchResults query={q} delayMs={delayMs} />
      </Suspense>
    </div>
  );
}
