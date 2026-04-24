"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function NavClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <p id="forward-pending-state">{isPending ? "pending" : "idle"}</p>
      <button
        id="push-to-destination"
        onClick={() => {
          startTransition(() => {
            router.push("/nextjs-compat/router-back-forward-pending/destination");
          });
        }}
      >
        Push to destination
      </button>
      <button
        id="router-forward-btn"
        onClick={() => {
          startTransition(() => {
            router.forward();
          });
        }}
      >
        Router forward
      </button>
    </div>
  );
}
