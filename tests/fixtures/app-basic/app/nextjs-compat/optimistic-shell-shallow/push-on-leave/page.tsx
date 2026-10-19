"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect } from "react";

export default function Page() {
  const router = useRouter();
  useLayoutEffect(() => {
    return () => {
      router.push("/nextjs-compat/optimistic-shell-shallow/final");
      window.history.replaceState(null, "", "?x=1");
    };
  }, [router]);
  return <h1 id="optimistic-shell-home">Push on leave</h1>;
}
