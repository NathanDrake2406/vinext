export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return <h1 id="final">Final</h1>;
}
