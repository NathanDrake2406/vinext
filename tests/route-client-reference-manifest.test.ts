import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AppRoute } from "../packages/vinext/src/routing/app-router.js";
import { collectAppRouteModuleFiles } from "../packages/vinext/src/server/app-route-module-files.js";
import {
  buildRouteClientReferenceCandidateManifest,
  createClientReferenceImportIndex,
  getRouteClientReferenceImportCandidatesInRouteOrder,
  normalizeClientReferenceImportId,
  resolveClientReferenceIdsForImportCandidates,
} from "../packages/vinext/src/server/route-client-reference-manifest.js";

function createRoute(overrides: Partial<AppRoute> = {}): AppRoute {
  return {
    pattern: "/dashboard",
    patternParts: ["dashboard"],
    pagePath: "/app/dashboard/page.tsx",
    routePath: "/app/dashboard/route.ts",
    layouts: ["/app/layout.tsx", "/app/dashboard/layout.tsx"],
    templates: ["/app/dashboard/template.tsx"],
    parallelSlots: [
      {
        key: "modal:/app/dashboard/@modal",
        name: "modal",
        ownerDir: "/app/dashboard",
        ownerTreePath: "/dashboard",
        hasPage: false,
        pagePath: "/app/dashboard/@modal/page.tsx",
        defaultPath: "/app/dashboard/@modal/default.tsx",
        layoutPath: "/app/dashboard/@modal/layout.tsx",
        loadingPath: "/app/dashboard/@modal/loading.tsx",
        errorPath: "/app/dashboard/@modal/error.tsx",
        interceptingRoutes: [
          {
            convention: ".",
            targetPattern: "/photos/:id",
            sourceMatchPattern: "/dashboard",
            pagePath: "/app/dashboard/@modal/(.)photos/[id]/page.tsx",
            layoutPaths: ["/app/dashboard/@modal/(.)photos/layout.tsx"],
            params: ["id"],
          },
        ],
        layoutIndex: 1,
        routeSegments: ["@modal"],
      },
    ],
    siblingIntercepts: [
      {
        convention: ".",
        targetPattern: "/settings",
        sourceMatchPattern: "/dashboard",
        pagePath: "/app/dashboard/(.)settings/page.tsx",
        layoutPaths: ["/app/dashboard/(.)settings/layout.tsx"],
        params: [],
      },
    ],
    loadingPath: "/app/dashboard/loading.tsx",
    errorPath: "/app/dashboard/error.tsx",
    layoutErrorPaths: [null, "/app/dashboard/error.tsx"],
    errorPaths: ["/app/dashboard/leaf-error.tsx"],
    notFoundPath: "/app/dashboard/not-found.tsx",
    notFoundPaths: ["/app/not-found.tsx", "/app/dashboard/not-found.tsx"],
    forbiddenPath: "/app/dashboard/forbidden.tsx",
    forbiddenPaths: ["/app/forbidden.tsx", "/app/dashboard/forbidden.tsx"],
    unauthorizedPath: "/app/dashboard/unauthorized.tsx",
    unauthorizedPaths: ["/app/unauthorized.tsx", "/app/dashboard/unauthorized.tsx"],
    routeSegments: ["dashboard"],
    templateTreePositions: [1],
    layoutTreePositions: [0, 1],
    isDynamic: false,
    params: [],
    ...overrides,
  };
}

function createSinglePageRoute(pagePath: string): AppRoute {
  return createRoute({
    pattern: "/",
    pagePath,
    routePath: null,
    layouts: [],
    templates: [],
    parallelSlots: [],
    siblingIntercepts: [],
    loadingPath: null,
    errorPath: null,
    layoutErrorPaths: [],
    errorPaths: [],
    notFoundPath: null,
    notFoundPaths: [],
    forbiddenPath: null,
    forbiddenPaths: [],
    unauthorizedPath: null,
    unauthorizedPaths: [],
  });
}

describe("app route module files", () => {
  it("collects all route modules and includes route handlers only when requested", () => {
    const route = createRoute();

    expect(collectAppRouteModuleFiles(route)).not.toContain("/app/dashboard/route.ts");
    expect(collectAppRouteModuleFiles(route, { includeRouteHandler: true })).toContain(
      "/app/dashboard/route.ts",
    );
  });
});

describe("route client reference manifest", () => {
  it("normalizes Vite query suffixes and virtual prefixes", () => {
    expect(normalizeClientReferenceImportId("\0/tmp/app/client.tsx?v=1#hash")).toBe(
      "/tmp/app/client.tsx",
    );
  });

  it("maps route import candidates to client reference IDs", () => {
    const referenceIds = resolveClientReferenceIdsForImportCandidates(
      ["/tmp/app/client-a.tsx", "package-client"],
      createClientReferenceImportIndex({
        "a#default": "/tmp/app/client-a.tsx?used",
        "b#default": "/tmp/app/client-b.tsx",
        "pkg#default": "package-client",
      }),
    );

    expect(referenceIds).toEqual(["a#default", "pkg#default"]);
  });

  it("walks transitive project-local imports and keeps scoped route order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      await fs.mkdir(path.join(appDir, "dashboard"), { recursive: true });
      await fs.writeFile(
        path.join(appDir, "layout.tsx"),
        `import "./shell";\nexport default function Layout({ children }) { return children; }`,
      );
      await fs.writeFile(
        path.join(appDir, "shell.tsx"),
        `import Search from "./search";\nexport default function Shell() { return <Search />; }`,
      );
      await fs.writeFile(
        path.join(appDir, "search.tsx"),
        `"use client";\nexport default function Search() { return null; }`,
      );
      await fs.writeFile(
        path.join(appDir, "dashboard", "page.tsx"),
        `import Counter from "../counter";\nexport default function Page() { return <Counter />; }`,
      );
      await fs.writeFile(
        path.join(appDir, "counter.tsx"),
        `"use client";\nexport default function Counter() { return null; }`,
      );

      const routes = [
        createRoute({
          pattern: "/",
          ids: {
            route: "route:/",
            page: "page:/",
            routeHandler: null,
            rootBoundary: null,
            layouts: [],
            templates: [],
            slots: {},
          },
          pagePath: path.join(appDir, "dashboard", "page.tsx"),
          routePath: null,
          layouts: [path.join(appDir, "layout.tsx")],
          templates: [],
          parallelSlots: [],
          siblingIntercepts: [],
          loadingPath: null,
          errorPath: null,
          layoutErrorPaths: [null],
          errorPaths: [],
          notFoundPath: null,
          notFoundPaths: [null],
          forbiddenPath: null,
          forbiddenPaths: [null],
          unauthorizedPath: null,
          unauthorizedPaths: [null],
        }),
      ];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });
      const [candidates] = getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes);

      expect(candidates).toContain(
        normalizeClientReferenceImportId(path.join(appDir, "search.tsx")),
      );
      expect(candidates).toContain(
        normalizeClientReferenceImportId(path.join(appDir, "counter.tsx")),
      );
      expect(manifest.dependencies).toEqual([
        normalizeClientReferenceImportId(path.join(appDir, "counter.tsx")),
        normalizeClientReferenceImportId(path.join(appDir, "dashboard", "page.tsx")),
        normalizeClientReferenceImportId(path.join(appDir, "layout.tsx")),
        normalizeClientReferenceImportId(path.join(appDir, "search.tsx")),
        normalizeClientReferenceImportId(path.join(appDir, "shell.tsx")),
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("includes global seed files in every route's scoped candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.tsx");
      const globalErrorPath = path.join(appDir, "global-error.tsx");
      const globalErrorClientPath = path.join(appDir, "global-error-client.tsx");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(pagePath, `export default function Page() { return null; }`);
      await fs.writeFile(
        globalErrorPath,
        `import GlobalErrorClient from "./global-error-client";\nexport default function GlobalError() { return <GlobalErrorClient />; }`,
      );
      await fs.writeFile(
        globalErrorClientPath,
        `"use client";\nexport default function GlobalErrorClient() { return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        globalSeedFiles: [globalErrorPath],
        projectRoot: root,
      });
      const [candidates] = getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes);

      expect(candidates).toContain(normalizeClientReferenceImportId(globalErrorPath));
      expect(candidates).toContain(normalizeClientReferenceImportId(globalErrorClientPath));
      expect(manifest.dependencies).toContain(normalizeClientReferenceImportId(globalErrorPath));
      expect(manifest.dependencies).toContain(normalizeClientReferenceImportId(pagePath));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks routes incomplete when a global seed file cannot be scanned", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.tsx");
      const globalErrorPath = path.join(appDir, "global-error.mdx");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(pagePath, `export default function Page() { return null; }`);
      await fs.writeFile(
        globalErrorPath,
        `import GlobalErrorClient from "./global-error-client";\n\nexport default function GlobalError() { return <GlobalErrorClient />; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        globalSeedFiles: [globalErrorPath],
        projectRoot: root,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
      expect(manifest.dependencies).toContain(normalizeClientReferenceImportId(globalErrorPath));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("tracks route files as dependencies so dev edits can regenerate scoped candidates", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.tsx");
      const clientPath = path.join(appDir, "Island.tsx");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(pagePath, `export default function Page() { return null; }`);
      await fs.writeFile(
        clientPath,
        `"use client";\nexport default function Island() { return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const firstManifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });
      expect(firstManifest.dependencies).toContain(normalizeClientReferenceImportId(pagePath));

      await fs.writeFile(
        pagePath,
        `import Island from "./Island";\nexport default function Page() { return <Island />; }`,
      );
      const changedManifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });
      const [changedCandidates] = getRouteClientReferenceImportCandidatesInRouteOrder(
        changedManifest,
        routes,
      );

      expect(changedCandidates).toContain(normalizeClientReferenceImportId(clientPath));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks routes with dynamic imports incomplete so callers can keep global preload", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const pagePath = path.join(root, "app", "page.tsx");
      await fs.mkdir(path.dirname(pagePath), { recursive: true });
      await fs.writeFile(
        pagePath,
        `export default async function Page() { const mod = await import ("./client"); return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks CommonJS module loading incomplete so callers can keep global preload", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.js");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(
        pagePath,
        `const Client = require("./client");\nmodule.exports = function Page() { return Client; };`,
      );
      await fs.writeFile(
        path.join(appDir, "client.js"),
        `"use client";\nmodule.exports = function Client() { return null; };`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks createRequire usage incomplete so callers can keep global preload", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.mjs");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(
        pagePath,
        `const require = createRequire(import.meta.url);\nconst Client = require("./client.cjs");\nexport default function Page() { return Client; }`,
      );
      await fs.writeFile(
        path.join(appDir, "client.cjs"),
        `"use client";\nmodule.exports = function Client() { return null; };`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("follows Vite resolution when it disagrees with local extension order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const appDir = path.join(root, "app");
      const pagePath = path.join(appDir, "page.tsx");
      const heuristicPath = path.join(appDir, "island.tsx");
      const viteResolvedPath = path.join(appDir, "island.jsx");
      const heuristicClientPath = path.join(appDir, "heuristic-client.tsx");
      const viteClientPath = path.join(appDir, "vite-client.jsx");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(
        pagePath,
        `import Island from "./island";\nexport default function Page() { return <Island />; }`,
      );
      await fs.writeFile(
        heuristicPath,
        `import HeuristicClient from "./heuristic-client";\nexport default function Island() { return <HeuristicClient />; }`,
      );
      await fs.writeFile(
        viteResolvedPath,
        `import ViteClient from "./vite-client";\nexport default function Island() { return <ViteClient />; }`,
      );
      await fs.writeFile(
        heuristicClientPath,
        `"use client";\nexport default function HeuristicClient() { return null; }`,
      );
      await fs.writeFile(
        viteClientPath,
        `"use client";\nexport default function ViteClient() { return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
        resolve: async (specifier, importerPath) => {
          if (specifier === "./island" && importerPath === pagePath) return viteResolvedPath;
          if (specifier === "./vite-client" && importerPath === viteResolvedPath) {
            return viteClientPath;
          }
          if (specifier === "./heuristic-client" && importerPath === heuristicPath) {
            return heuristicClientPath;
          }
          return null;
        },
      });
      const [candidates] = getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes);

      expect(candidates).toContain(normalizeClientReferenceImportId(viteResolvedPath));
      expect(candidates).toContain(normalizeClientReferenceImportId(viteClientPath));
      expect(candidates).not.toContain(normalizeClientReferenceImportId(heuristicPath));
      expect(candidates).not.toContain(normalizeClientReferenceImportId(heuristicClientPath));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks unsupported route source files incomplete so custom pageExtensions fall back", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const pagePath = path.join(root, "app", "page.mdx");
      await fs.mkdir(path.dirname(pagePath), { recursive: true });
      await fs.writeFile(
        pagePath,
        `import ClientIsland from "./ClientIsland";\n\nexport default function Page() { return <ClientIsland />; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks package import graphs incomplete when package source is not scanned", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    try {
      const pagePath = path.join(root, "app", "page.tsx");
      const packageEntryPath = path.join(root, "node_modules", "@acme", "ui", "index.js");
      const packageButtonPath = path.join(root, "node_modules", "@acme", "ui", "button.js");
      await fs.mkdir(path.dirname(pagePath), { recursive: true });
      await fs.mkdir(path.dirname(packageEntryPath), { recursive: true });
      await fs.writeFile(
        pagePath,
        `import { Button } from "@acme/ui";\nexport default function Page() { return <Button />; }`,
      );
      await fs.writeFile(packageEntryPath, `export { Button } from "./button.js";`);
      await fs.writeFile(
        packageButtonPath,
        `"use client";\nexport function Button() { return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot: root,
        resolve: async (specifier) => (specifier === "@acme/ui" ? packageEntryPath : null),
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("marks aliases resolving outside projectRoot incomplete", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-client-refs-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vinext-workspace-ui-"));
    try {
      const pagePath = path.join(projectRoot, "app", "page.tsx");
      const aliasedClientPath = path.join(workspaceRoot, "Button.tsx");
      await fs.mkdir(path.dirname(pagePath), { recursive: true });
      await fs.writeFile(
        pagePath,
        `import { Button } from "@workspace/ui/Button";\nexport default function Page() { return <Button />; }`,
      );
      await fs.writeFile(
        aliasedClientPath,
        `"use client";\nexport function Button() { return null; }`,
      );

      const routes = [createSinglePageRoute(pagePath)];
      const manifest = await buildRouteClientReferenceCandidateManifest(routes, {
        projectRoot,
        resolve: async (specifier) =>
          specifier === "@workspace/ui/Button" ? aliasedClientPath : null,
      });

      expect(getRouteClientReferenceImportCandidatesInRouteOrder(manifest, routes)).toEqual([null]);
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
