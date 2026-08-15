"use client";

import { useRouter } from "next/navigation";

/** Same-pathname hash change issued programmatically instead of through `<Link>`. */
export function HashCrossPathPushDestinationActions() {
  const router = useRouter();

  return (
    <button
      id="push-to-target-baz"
      onClick={() => router.push("/nextjs-compat/hash-cross-path-push/destination#baz")}
      type="button"
    >
      Push destination#baz
    </button>
  );
}
