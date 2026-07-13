import { describe, expect, it } from "vitest";
import { acquireRouteAnnouncer } from "vinext/internal/client/route-announcer.js";

class FakeShadowRoot {
  children: FakeElement[] = [];

  appendChild<T extends FakeElement>(node: T): T {
    this.children.push(node);
    return node;
  }

  querySelector(selector: string): FakeElement | null {
    const id = selector.startsWith("#") ? selector.slice(1) : null;
    return id ? (this.children.find((child) => child.id === id) ?? null) : null;
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly style = { cssText: "", position: "" };
  id = "";
  isConnected = false;
  shadowRoot: FakeShadowRoot | null = null;
  textContent = "";

  constructor(
    readonly tagName: string,
    private readonly owner: FakeDocument,
  ) {}

  attachShadow(init: { mode: "open" | "closed" }): FakeShadowRoot {
    expect(init.mode).toBe("open");
    this.shadowRoot = new FakeShadowRoot();
    return this.shadowRoot;
  }

  remove(): void {
    this.owner.remove(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  private readonly elements: FakeElement[] = [];
  readonly body = {
    appendChild: <T extends FakeElement>(node: T): T => {
      this.elements.push(node);
      node.isConnected = true;
      return node;
    },
  };

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  querySelector(selector: string): FakeElement | null {
    return this.elements.find((element) => element.tagName === selector) ?? null;
  }

  remove(element: FakeElement): void {
    const index = this.elements.indexOf(element);
    if (index !== -1) this.elements.splice(index, 1);
    element.isConnected = false;
  }
}

describe("shared route announcer", () => {
  it("shares one Next-compatible live region until every owner releases it", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const fakeDocument = new FakeDocument();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: fakeDocument as unknown as Document,
    });

    let first: ReturnType<typeof acquireRouteAnnouncer> | undefined;
    let second: ReturnType<typeof acquireRouteAnnouncer> | undefined;

    try {
      first = acquireRouteAnnouncer();
      second = acquireRouteAnnouncer();

      const host = fakeDocument.querySelector("next-route-announcer");
      const node = host?.shadowRoot?.querySelector("#__next-route-announcer__");

      expect(host?.style.position).toBe("absolute");
      expect(node?.attributes.get("aria-live")).toBe("assertive");
      expect(node?.attributes.get("role")).toBe("alert");
      expect(node?.style.cssText).toContain("clip:rect(0 0 0 0)");

      first.announce("First route");
      expect(node?.textContent).toBe("First route");

      first.release();
      expect(host?.isConnected).toBe(true);

      second.announce("Second route");
      expect(node?.textContent).toBe("Second route");
      second.release();

      expect(fakeDocument.querySelector("next-route-announcer")).toBeNull();
    } finally {
      first?.release();
      second?.release();
      if (originalDocument) {
        Object.defineProperty(globalThis, "document", originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, "document");
      }
    }
  });
});
