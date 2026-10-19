"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, type ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wroteHistory = useRef(false);
  useLayoutEffect(() => {
    return () => {
      if (wroteHistory.current) return;
      wroteHistory.current = true;
      window.history.replaceState(null, "", "?x=1");
    };
  }, [pathname]);
  return <section>{children}</section>;
}
