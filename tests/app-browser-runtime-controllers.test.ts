import { describe, expect, it, vi } from "vite-plus/test";
import { createAppBrowserRuntimeControllerAccessors } from "../packages/vinext/src/server/app-browser-runtime-controllers.js";

describe("App Router browser runtime controller accessors", () => {
  it("constructs each controller independently on first use and reuses it", () => {
    const createHistoryController = vi.fn(() => ({ kind: "history" as const }));
    const createMpaNavigationScheduler = vi.fn(() => ({ kind: "mpa" as const }));
    const { getHistoryController, getMpaNavigationScheduler } =
      createAppBrowserRuntimeControllerAccessors({
        createHistoryController,
        createMpaNavigationScheduler,
      });

    expect(createHistoryController).not.toHaveBeenCalled();
    expect(createMpaNavigationScheduler).not.toHaveBeenCalled();

    const historyController = getHistoryController();
    expect(getHistoryController()).toBe(historyController);
    expect(createHistoryController).toHaveBeenCalledTimes(1);
    expect(createMpaNavigationScheduler).not.toHaveBeenCalled();

    const mpaNavigationScheduler = getMpaNavigationScheduler();
    expect(getMpaNavigationScheduler()).toBe(mpaNavigationScheduler);
    expect(createMpaNavigationScheduler).toHaveBeenCalledTimes(1);
  });
});
