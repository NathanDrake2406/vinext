import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ViteDevServer } from "vite";
import { expect, it } from "vitest";
import { startFixtureServer } from "./helpers.js";

async function symlinkWorkspacePackage(fixtureRoot: string, packageName: string): Promise<void> {
  await fsp.symlink(
    path.resolve(import.meta.dirname, "..", "node_modules", packageName),
    path.join(fixtureRoot, "node_modules", packageName),
    "dir",
  );
}

async function writeStartupOptimizeFixture(fixtureRoot: string): Promise<void> {
  const appDir = path.join(fixtureRoot, "app");
  const packageDir = path.join(fixtureRoot, "node_modules", "@vinext-test", "startup-dep");

  await fsp.mkdir(path.join(appDir, "(startup)"), { recursive: true });
  await fsp.mkdir(path.join(appDir, "@modal"), { recursive: true });
  await fsp.mkdir(path.join(appDir, "@drawer", "(startup-slot)"), { recursive: true });
  await fsp.mkdir(path.join(appDir, "about"), { recursive: true });
  await fsp.mkdir(packageDir, { recursive: true });
  await symlinkWorkspacePackage(fixtureRoot, "@vitejs");
  await symlinkWorkspacePackage(fixtureRoot, "react");
  await symlinkWorkspacePackage(fixtureRoot, "react-dom");

  await fsp.writeFile(
    path.join(fixtureRoot, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  );
  await fsp.writeFile(
    path.join(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@vinext-test/startup-dep",
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    )}\n`,
  );
  await fsp.writeFile(
    path.join(packageDir, "index.js"),
    `export const startupMarker = "startup-dep-loaded";\n`,
  );
  await fsp.writeFile(
    path.join(appDir, "layout.tsx"),
    `import type { ReactNode } from "react";

export default function RootLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal: ReactNode;
}) {
  return (
    <html>
      <body>
        {children}
        {modal}
      </body>
    </html>
  );
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "(startup)", "page.tsx"),
    `import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupRootPage() {
  return <main data-testid="route-group-root">route group root {startupMarker}</main>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@modal", "default.tsx"),
    `import { startupMarker } from "@vinext-test/startup-dep";

export default function RootSlotDefault() {
  return <aside data-testid="root-slot-default">root slot default {startupMarker}</aside>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@drawer", "(startup-slot)", "page.tsx"),
    `import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupSlotPage() {
  return <aside>route group slot page {startupMarker}</aside>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@drawer", "(startup-slot)", "default.tsx"),
    `import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupSlotDefault() {
  return <aside>route group slot default {startupMarker}</aside>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@drawer", "(startup-slot)", "layout.tsx"),
    `import type { ReactNode } from "react";
import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupSlotLayout({ children }: { children: ReactNode }) {
  return <section data-startup-marker={startupMarker}>{children}</section>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@drawer", "(startup-slot)", "loading.tsx"),
    `import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupSlotLoading() {
  return <span>route group slot loading {startupMarker}</span>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "@drawer", "(startup-slot)", "error.tsx"),
    `"use client";

import { startupMarker } from "@vinext-test/startup-dep";

export default function RouteGroupSlotError() {
  return <span>route group slot error {startupMarker}</span>;
}
`,
  );
  await fsp.writeFile(
    path.join(appDir, "about", "page.tsx"),
    `export default function AboutPage() {
  return <main>About should not be an optimizer startup entry</main>;
}
`,
  );
}

it("includes URL-invisible root files in focused App Router optimizeDeps.entries", async () => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "vinext-startup-optimize-"));
  let fixtureServer: ViteDevServer | undefined;
  let fixtureBaseUrl = "";

  try {
    await writeStartupOptimizeFixture(fixtureRoot);
    ({ server: fixtureServer, baseUrl: fixtureBaseUrl } = await startFixtureServer(fixtureRoot, {
      appRouter: true,
    }));

    const rscEntries = fixtureServer.config.environments.rsc?.optimizeDeps?.entries;
    const ssrEntries = fixtureServer.config.environments.ssr?.optimizeDeps?.entries;
    const clientEntries = fixtureServer.config.environments.client?.optimizeDeps?.entries;

    const environmentEntries = {
      rsc: rscEntries,
      ssr: ssrEntries,
      client: clientEntries,
    };

    for (const [name, entries] of Object.entries(environmentEntries)) {
      expect(Array.isArray(entries), name).toBe(true);
      expect(entries, name).toContain("app/(startup)/page.tsx");
      expect(entries, name).toContain("app/@modal/default.tsx");
      expect(entries, name).toContain("app/@drawer/(startup-slot)/page.tsx");
      expect(entries, name).not.toContain("app/@drawer/(startup-slot)/default.tsx");
      expect(entries, name).not.toContain("app/@drawer/(startup-slot)/layout.tsx");
      expect(entries, name).not.toContain("app/@drawer/(startup-slot)/loading.tsx");
      expect(entries, name).not.toContain("app/@drawer/(startup-slot)/error.tsx");
      expect(entries, name).not.toContain("app/about/page.tsx");
    }

    const rootResponse = await fetch(`${fixtureBaseUrl}/`);
    const html = await rootResponse.text();
    if (rootResponse.status !== 200) {
      throw new Error(html);
    }
    expect(html).toMatch(/route group root\s*(<!--\s*-->)?\s*startup-dep-loaded/);
    expect(html).toMatch(/root slot default\s*(<!--\s*-->)?\s*startup-dep-loaded/);
  } finally {
    await fixtureServer?.close();
    await fsp.rm(fixtureRoot, { recursive: true, force: true });
  }
});
