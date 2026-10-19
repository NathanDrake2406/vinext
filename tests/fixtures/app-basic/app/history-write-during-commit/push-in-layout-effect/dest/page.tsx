"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";

export default function Page() {
  const router = useRouter();
  useLayoutEffect(() => {
    router.push("/history-write-during-commit/final");
    window.history.replaceState(null, "", "?x=1");
  }, [router]);
  return <p id="dest">Dest</p>;
}
