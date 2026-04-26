"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function BackClient({ pageId }: { pageId: "b" | "b2" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <p id="back-pending-state">
        {pageId}:{isPending ? "pending" : "idle"}
      </p>
      <button
        id="router-back-btn"
        onClick={() => {
          startTransition(() => {
            router.back();
          });
        }}
      >
        Router back
      </button>
      <button
        id="router-double-back-btn"
        onClick={() => {
          startTransition(() => {
            router.back();
            router.back();
          });
        }}
      >
        Router double back
      </button>
      <button
        id="router-forward-from-b-btn"
        onClick={() => {
          startTransition(() => {
            router.forward();
          });
        }}
      >
        Router forward from B
      </button>
      <button
        id="push-to-step2"
        onClick={() => {
          startTransition(() => {
            router.push("/nextjs-compat/router-back-forward-pending/destination/step2");
          });
        }}
      >
        Push to step2
      </button>
      <button
        id="router-back-then-forward-btn"
        onClick={() => {
          startTransition(() => {
            router.back();
            router.forward();
          });
        }}
      >
        Router back then forward in one transition
      </button>
      <button
        id="router-back-then-push-btn"
        onClick={() => {
          startTransition(() => {
            router.back();
            router.push("/nextjs-compat/router-back-forward-pending/destination/step2");
          });
        }}
      >
        Router back then push in one transition
      </button>
    </div>
  );
}
