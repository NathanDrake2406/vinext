import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type ViteDevServer } from "vite";
import { describe, expect, it } from "vitest";
import { startFixtureServer } from "./helpers.js";
import { createValidFileMatcher } from "../packages/vinext/src/routing/file-matcher.js";
import { collectAppRouterStartupOptimizeEntries } from "../packages/vinext/src/routing/app-startup-optimize-entries.js";

const LAYOUT = `export default function L({ children }: { children: unknown }) { return children; }\n`;
const PAGE = `export default function P() { return null; }\n`;

async function withTempApp(
  files: Record<string, string>,
  run: (collect: () => Promise<string[]>) => Promise<void>,
): Promise<void> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "vinext-startup-collect-"));
  try {
    const appDir = path.join(root, "app");
    for (const [relativePath, contents] of Object.entries(files)) {
      const filePath = path.join(appDir, relativePath);
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, contents);
    }
    const matcher = createValidFileMatcher();
    await run(() => collectAppRouterStartupOptimizeEntries({ root, appDir, matcher }));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

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

describe("collectAppRouterStartupOptimizeEntries (projection of the route graph)", () => {
  it("includes a transparent @children root page", async () => {
    // app/@children/page.tsx is the real "/" page (Next.js treats @children as
    // transparent), so its module must be a startup entry. A bespoke walk that
    // only recurses route groups and non-@children slots silently dropped it.
    await withTempApp(
      {
        "layout.tsx": LAYOUT,
        "@children/page.tsx": PAGE,
      },
      async (collect) => {
        const entries = await collect();
        expect(entries).toContain("app/@children/page.tsx");
        expect(entries).toContain("app/layout.tsx");
      },
    );
  });

  it("excludes route-group conventions that do not resolve to the root URL", async () => {
    // (admin)/layout.tsx only wraps /dashboard, never "/", so it is not a
    // startup module. Including every invisible route-group shell reintroduced
    // the whole-app scaling this projection exists to remove.
    await withTempApp(
      {
        "layout.tsx": LAYOUT,
        "page.tsx": PAGE,
        "(admin)/layout.tsx": LAYOUT,
        "(admin)/dashboard/page.tsx": PAGE,
      },
      async (collect) => {
        const entries = await collect();
        expect(entries).toEqual(expect.arrayContaining(["app/layout.tsx", "app/page.tsx"]));
        expect(entries).not.toContain("app/(admin)/layout.tsx");
        expect(entries).not.toContain("app/(admin)/dashboard/page.tsx");
      },
    );
  });

  it("includes a slot root page found through a route group, mirroring what the graph loads", async () => {
    // A slot's root page can live under a transparent route group. The renderer
    // loads that page but not the route-group-nested layout (the graph models a
    // slot's layout only at the slot root, app/@drawer/layout.tsx). The startup
    // set tracks the graph exactly: page in, nested layout out — so the two
    // never disagree, regardless of which file imports which dep.
    await withTempApp(
      {
        "layout.tsx": LAYOUT,
        "page.tsx": PAGE,
        "@drawer/(group)/page.tsx": PAGE,
        "@drawer/(group)/layout.tsx": LAYOUT,
      },
      async (collect) => {
        const entries = await collect();
        expect(entries).toContain("app/@drawer/(group)/page.tsx");
        expect(entries).not.toContain("app/@drawer/(group)/layout.tsx");
      },
    );
  });
});

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
