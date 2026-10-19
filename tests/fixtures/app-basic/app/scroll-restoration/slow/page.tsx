export default async function Page() {
  // Commit the loading shell before the page.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return <p id="slow-page">Slow page</p>;
}
