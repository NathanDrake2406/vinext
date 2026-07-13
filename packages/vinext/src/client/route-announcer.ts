const ANNOUNCER_TAG = "next-route-announcer";
const ANNOUNCER_ID = "__next-route-announcer__";

type AnnouncerOwnership = {
  host: HTMLElement;
  node: HTMLElement;
  references: number;
};

export type RouteAnnouncer = {
  announce: (message: string) => void;
  release: () => void;
};

let activeAnnouncer: AnnouncerOwnership | null = null;

function getOrCreateAnnouncer(): AnnouncerOwnership {
  if (activeAnnouncer?.host.isConnected) return activeAnnouncer;

  const existingHost = document.querySelector<HTMLElement>(ANNOUNCER_TAG);
  const existingNode = existingHost?.shadowRoot?.querySelector<HTMLElement>(`#${ANNOUNCER_ID}`);
  if (existingHost && existingNode) {
    activeAnnouncer = { host: existingHost, node: existingNode, references: 0 };
    return activeAnnouncer;
  }

  // A globally named host with a different shape cannot satisfy the shared
  // contract. Replace it rather than creating two competing live regions.
  existingHost?.remove();

  const host = document.createElement(ANNOUNCER_TAG);
  host.style.position = "absolute";

  const node = document.createElement("div");
  node.id = ANNOUNCER_ID;
  node.setAttribute("aria-live", "assertive");
  node.setAttribute("role", "alert");
  node.style.cssText =
    "position:absolute;border:0;height:1px;margin:-1px;padding:0;width:1px;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap;word-wrap:normal";

  host.attachShadow({ mode: "open" }).appendChild(node);
  document.body.appendChild(host);

  activeAnnouncer = { host, node, references: 0 };
  return activeAnnouncer;
}

/**
 * Acquire the shared Next-compatible route announcement live region.
 *
 * Routers own when and what to announce. This primitive owns the single global
 * DOM contract and keeps it mounted until every router consumer has released it.
 */
export function acquireRouteAnnouncer(): RouteAnnouncer {
  const ownership = getOrCreateAnnouncer();
  ownership.references += 1;
  let released = false;

  return {
    announce(message) {
      ownership.node.textContent = message;
    },
    release() {
      if (released) return;
      released = true;
      ownership.references -= 1;

      if (ownership.references === 0) {
        ownership.host.remove();
        if (activeAnnouncer === ownership) activeAnnouncer = null;
      }
    },
  };
}
