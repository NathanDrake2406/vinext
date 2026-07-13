import { defineConfig } from "vite";
import vinext from "vinext";

// This fixture owns the build-time diagnostic flag so the dedicated Playwright
// project cannot inherit a non-diagnostic optimized graph from another app-basic run.
process.env.VINEXT_DEBUG_NAVIGATION = "1";

export default defineConfig({
  plugins: [vinext({ appDir: import.meta.dirname })],
});
