import { Suspense } from "react";
import { BackClient } from "../back-client";

async function SlowServerContent() {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return <p id="page-b2-marker">page B2 server content</p>;
}

export default function RouterBackForwardPendingStep2Page() {
  return (
    <div>
      <h1>Router back/forward pending — page B2</h1>
      <BackClient pageId="b2" />
      <Suspense fallback={<p id="page-b2-loading">loading B2</p>}>
        <SlowServerContent />
      </Suspense>
    </div>
  );
}
