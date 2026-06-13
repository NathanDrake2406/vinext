"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function VisibleUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  return <p id="visible-url">{query === "" ? pathname : `${pathname}?${query}`}</p>;
}
