"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";

export default function Page() {
  const router = useRouter();
  useLayoutEffect(() => {
    return () => {
      router.push("/history-write-during-commit/final");
    };
  }, [router]);
  return (
    <div>
      <p id="source">Source</p>
      <Link id="to-dest" href="/history-write-during-commit/push-in-cleanup/dest">
        Go to dest
      </Link>
    </div>
  );
}
