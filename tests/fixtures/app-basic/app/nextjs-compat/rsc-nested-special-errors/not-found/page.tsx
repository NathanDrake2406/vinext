import { notFound } from "next/navigation";

async function NestedChild() {
  await Promise.resolve();
  notFound();
}

export default function Page() {
  return <NestedChild />;
}
