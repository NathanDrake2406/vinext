"use client";

import { useLayoutEffect } from "react";

export default function Page() {
  useLayoutEffect(() => {
    window.history.replaceState(null, "", "?x=1");
  }, []);
  return <p id="dest">Dest</p>;
}
