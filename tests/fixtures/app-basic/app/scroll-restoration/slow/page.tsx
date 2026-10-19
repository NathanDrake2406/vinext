export default async function Page() {
  // Keep the loading boundary visible, so the navigation commits its
  // optimistic shell before the page.
  await new Promise((resolve) => setTimeout(resolve, 500));
  return <p id="slow-page">Slow page</p>;
}
