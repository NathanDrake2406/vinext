export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const query = await searchParams;
  return { title: `Streamed not-found source: ${query.source ?? "missing"}` };
}

export default function MetadataStreamingNotFoundSearchParams() {
  return <main>Streamed metadata not found with search params</main>;
}
