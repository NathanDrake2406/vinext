import { describe, expect, it } from "vite-plus/test";
import {
  resolveAppPageLeafSegmentStateKey,
  resolveAppPageSegmentStateKey,
} from "../packages/vinext/src/server/app-page-segment-state.js";

describe("app page segment state keys", () => {
  // Mirrors Next.js createRouterCacheKey(..., true): the React state key is
  // the active segment identity without search params, so search-only changes
  // do not reset templates or boundaries.
  it("resolves dynamic params into segment state keys without search params", () => {
    expect(
      resolveAppPageSegmentStateKey(["dashboard", "[team]", "settings"], 1, {
        team: "alpha",
      }),
    ).toBe("alpha");
  });

  it("skips route groups when selecting the state key below a tree position", () => {
    expect(
      resolveAppPageSegmentStateKey(["(marketing)", "blog", "[slug]"], 0, {
        slug: "launch",
      }),
    ).toBe("blog");
    expect(
      resolveAppPageSegmentStateKey(["(marketing)", "blog", "[slug]"], 1, {
        slug: "launch",
      }),
    ).toBe("blog");
    expect(
      resolveAppPageSegmentStateKey(["(marketing)", "blog", "[slug]"], 2, {
        slug: "launch",
      }),
    ).toBe("launch");
  });

  it("uses the final visible segment for route-level loading and boundary reset", () => {
    expect(
      resolveAppPageLeafSegmentStateKey(["(marketing)", "blog", "[slug]"], {
        slug: "launch",
      }),
    ).toBe("launch");
    expect(resolveAppPageLeafSegmentStateKey(["(marketing)"], {})).toBe("");
  });

  it("keeps catch-all segment keys canonical", () => {
    expect(
      resolveAppPageSegmentStateKey(["docs", "[...parts]"], 1, {
        parts: ["guides", "routing"],
      }),
    ).toBe("guides/routing");
    expect(
      resolveAppPageSegmentStateKey(["docs", "[[...parts]]"], 1, {
        parts: [],
      }),
    ).toBe("");
  });
});
