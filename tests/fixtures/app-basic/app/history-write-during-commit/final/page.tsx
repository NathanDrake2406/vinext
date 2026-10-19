export default async function Page() {
  // Keep the navigation pending while the raw history write runs.
  await new Promise((resolve) => setTimeout(resolve, 300));
  return <p id="final">Final</p>;
}
