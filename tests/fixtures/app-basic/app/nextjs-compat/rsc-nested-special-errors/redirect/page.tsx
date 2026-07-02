import { redirect } from "next/navigation";

async function NestedChild() {
  await Promise.resolve();
  redirect("/nextjs-compat/nav-redirect-result");
}

export default function Page() {
  return <NestedChild />;
}
