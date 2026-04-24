import { Suspense } from "react";
import { BackClient } from "./back-client";

async function SlowServerContent() {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return <p id="page-b-marker">page B server content</p>;
}

export default function RouterBackForwardPendingDestinationPage() {
  return (
    <div>
      <h1>Router back/forward pending — page B</h1>
      <BackClient pageId="b" />
      <Suspense fallback={<p id="page-b-loading">loading B</p>}>
        <SlowServerContent />
      </Suspense>
    </div>
  );
}
