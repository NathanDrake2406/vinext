"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setFlagAction } from "./actions";

declare global {
  interface Window {
    __VINEXT_ACTION_REFRESH_STARTED__?: boolean;
  }
}

export function ActionRefreshClient({ value }: { value: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function mutateWithActionAndRefresh() {
    const nextValue = !value;
    window.__VINEXT_ACTION_REFRESH_STARTED__ = true;
    startTransition(async () => {
      await setFlagAction(nextValue);
      router.refresh();
    });
  }

  return (
    <main>
      <h1>Action Refresh No Rerender</h1>
      <p id="flag-value">{String(value)}</p>
      <button id="action-refresh" disabled={isPending} onClick={mutateWithActionAndRefresh}>
        Action then refresh
      </button>
    </main>
  );
}
