import { describe, expect, it } from "vite-plus/test";
import { getRaceFrame } from "../apps/web/app/_components/landing-motion";

describe("landing build race", () => {
  it("uses the slower vinext build as the race duration and bar denominator", () => {
    const halfway = getRaceFrame({ vinext: 6, nextjs: 3 }, 0.5);

    expect(halfway).toEqual({
      durationMs: 5_000,
      vinextTime: 3,
      nextjsTime: 3,
      vinextFill: 0.5,
      nextjsFill: 0.5,
      vinextDone: false,
    });

    expect(getRaceFrame({ vinext: 6, nextjs: 3 }, 1)).toEqual({
      durationMs: 5_000,
      vinextTime: 6,
      nextjsTime: 3,
      vinextFill: 1,
      nextjsFill: 0.5,
      vinextDone: true,
    });
  });

  it("finishes equal builds together with equal full-width bars", () => {
    expect(getRaceFrame({ vinext: 4, nextjs: 4 }, 0.5)).toEqual({
      durationMs: 4_000,
      vinextTime: 2,
      nextjsTime: 2,
      vinextFill: 0.5,
      nextjsFill: 0.5,
      vinextDone: false,
    });

    expect(getRaceFrame({ vinext: 4, nextjs: 4 }, 1)).toEqual({
      durationMs: 4_000,
      vinextTime: 4,
      nextjsTime: 4,
      vinextFill: 1,
      nextjsFill: 1,
      vinextDone: true,
    });
  });
});
