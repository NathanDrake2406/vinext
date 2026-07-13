"use client";

import { useEffect, useRef } from "react";
import { acquireRouteAnnouncer, type RouteAnnouncer } from "./route-announcer.js";

function readRouteAnnouncement(): string {
  if (document.title) return document.title;

  const heading = document.querySelector("h1");
  return heading?.innerText || heading?.textContent || "";
}

/**
 * Re-evaluate the accessible route name after each approved visible commit.
 *
 * This signal is broader than soft navigation, so an announcement is written
 * only when the resulting title or heading changed. An aborted or superseded
 * render cannot advance the signal and announce a route the user never saw.
 * The first effect pass only records the initial name because the browser
 * already announces a full document load.
 */
export function AppRouterAnnouncer({ commitVersion }: { commitVersion: number }) {
  const announcer = useRef<RouteAnnouncer | null>(null);
  const previousAnnouncement = useRef<string | undefined>(undefined);

  useEffect(() => {
    const acquiredAnnouncer = acquireRouteAnnouncer();
    announcer.current = acquiredAnnouncer;

    return () => {
      announcer.current = null;
      acquiredAnnouncer.release();
    };
  }, []);

  useEffect(() => {
    const currentAnnouncement = readRouteAnnouncement();
    if (
      previousAnnouncement.current !== undefined &&
      previousAnnouncement.current !== currentAnnouncement
    ) {
      announcer.current?.announce(currentAnnouncement);
    }
    previousAnnouncement.current = currentAnnouncement;
  }, [commitVersion]);

  return null;
}
