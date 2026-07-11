import { describe, expect, it } from "vite-plus/test";
import { getRaceFrame } from "../apps/web/app/lib/landing-race";

describe("landing build race", () => {
  it("uses the slower vinext build as the race duration and bar denominator", () => {
    const halfway = getRaceFrame({ vinext: 6, nextjs: 3 }, 0.5);

    expect(halfway).toEqual({
      durationMs: 6_000,
      vinextTime: 3,
      nextjsTime: 3,
      vinextFill: 0.5,
      nextjsFill: 0.5,
      vinextDone: false,
      nextjsDone: true,
    });

    expect(getRaceFrame({ vinext: 6, nextjs: 3 }, 1)).toEqual({
      durationMs: 6_000,
      vinextTime: 6,
      nextjsTime: 3,
      vinextFill: 1,
      nextjsFill: 0.5,
      vinextDone: true,
      nextjsDone: true,
    });
  });

  it("plays at true 1:1 wall-clock speed for the shipped fallback times", () => {
    // Regression guard: 6.2s used to get clipped by the old 5s cap, so the
    // finish line landed a full second before the "6.2s" it was displaying.
    expect(getRaceFrame({ vinext: 3.1, nextjs: 6.2 }, 1).durationMs).toBe(6_200);
  });

  it("only compresses playback once a build time clears the defensive ceiling", () => {
    expect(getRaceFrame({ vinext: 4, nextjs: 12 }, 1).durationMs).toBe(10_000);
  });

  it("finishes equal builds together with equal full-width bars", () => {
    expect(getRaceFrame({ vinext: 4, nextjs: 4 }, 0.5)).toEqual({
      durationMs: 4_000,
      vinextTime: 2,
      nextjsTime: 2,
      vinextFill: 0.5,
      nextjsFill: 0.5,
      vinextDone: false,
      nextjsDone: false,
    });

    expect(getRaceFrame({ vinext: 4, nextjs: 4 }, 1)).toEqual({
      durationMs: 4_000,
      vinextTime: 4,
      nextjsTime: 4,
      vinextFill: 1,
      nextjsFill: 1,
      vinextDone: true,
      nextjsDone: true,
    });
  });
});
