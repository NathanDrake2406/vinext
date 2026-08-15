"use client";

import { useRouter } from "next/navigation";

/** Programmatic counterpart to the cross-path `<Link>` on the start page. */
export function HashCrossPathPushActions() {
  const router = useRouter();

  return (
    <button
      id="push-to-target-foo"
      onClick={() => router.push("/nextjs-compat/hash-cross-path-push/destination#foo")}
      type="button"
    >
      Push destination#foo
    </button>
  );
}
