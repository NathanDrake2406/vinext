"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";

export default function Page() {
  useLayoutEffect(() => {
    return () => {
      window.history.replaceState(null, "", "?left=1");
    };
  }, []);

  return (
    <div>
      <p id="source">Source</p>
      <Link id="to-dest" href="/history-write-during-commit/dest">
        Go to dest
      </Link>
    </div>
  );
}
