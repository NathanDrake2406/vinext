import { Suspense } from "react";
import { NavClient } from "./nav-client";

async function SlowServerContent() {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return <p id="page-a-marker">page A server content</p>;
}

export default function RouterBackForwardPendingPage() {
  return (
    <div>
      <h1>Router back/forward pending — page A</h1>
      <NavClient />
      <Suspense fallback={<p id="page-a-loading">loading A</p>}>
        <SlowServerContent />
      </Suspense>
    </div>
  );
}
