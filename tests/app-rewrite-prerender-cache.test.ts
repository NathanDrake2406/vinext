import fs from "node:fs";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { createBuilder } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import vinext from "../packages/vinext/src/index.js";
import { runPrerender } from "../packages/vinext/src/build/run-prerender.js";

function write(root: string, relativePath: string, contents: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

/** `depth` is the count of directories between the page file and `app/`. */
const LOCALE_PAGE = (
  label: string,
  depth: number,
) => `import { Pathname } from "${"../".repeat(depth)}pathname";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "es" }];
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <main>
      <p>{\`page:${label}:\${locale}\`}</p>
      <Pathname />
    </main>
  );
}
`;

// Ported from the reproduction in https://github.com/cloudflare/vinext/issues/3672:
// the default locale is served without a prefix through next.config rewrites.
describe.each([
  { label: "default config", basePath: "", trailingSlash: false },
  // Both options change the URL that the build requests and the pathname that
  // the request handler keys the render by.
  { label: "basePath and trailingSlash", basePath: "/docs", trailingSlash: true },
])(
  "prerendered App pages reached through next.config rewrites ($label)",
  ({ basePath, trailingSlash }) => {
    let root = "";
    let server: Server | undefined;
    let baseUrl = "";

    const url = (pathname: string) => {
      if (pathname === "/") return `${baseUrl}${basePath}${trailingSlash || !basePath ? "/" : ""}`;
      return `${baseUrl}${basePath}${pathname}${trailingSlash ? "/" : ""}`;
    };

    beforeAll(async () => {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-rewrite-prerender-cache-"));
      write(
        root,
        "package.json",
        JSON.stringify({ name: "rewrite-prerender-cache", type: "module" }),
      );
      fs.symlinkSync(
        path.resolve(import.meta.dirname, "../node_modules"),
        path.join(root, "node_modules"),
        "junction",
      );
      write(
        root,
        "next.config.mjs",
        `export default {
  basePath: ${JSON.stringify(basePath)},
  trailingSlash: ${JSON.stringify(trailingSlash)},
  async rewrites() {
    return {
      afterFiles: [
        { source: "/", destination: "/en" },
        // A request without the cookie, such as the build request, takes the first rule.
        { source: "/promo", missing: [{ type: "cookie", key: "seen" }], destination: "/en/about" },
        { source: "/promo", destination: "/en/contact" },
        {
          source: "/:path((?!en$|en/|es$|es/|api$|api/|_next/).*)",
          destination: "/en/:path",
        },
      ],
    };
  },
};
`,
      );
      write(
        root,
        "app/layout.tsx",
        `export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
`,
      );
      write(
        root,
        "app/pathname.tsx",
        `"use client";
import { usePathname } from "next/navigation";

export function Pathname() {
  return <p>{\`pathname:\${usePathname()}\`}</p>;
}
`,
      );
      write(root, "app/[locale]/page.tsx", LOCALE_PAGE("home", 1));
      write(root, "app/[locale]/about/page.tsx", LOCALE_PAGE("about", 2));
      write(root, "app/[locale]/docs/intro/page.tsx", LOCALE_PAGE("docs/intro", 3));
      // Only the Flight test requests this source URL: a document request that
      // misses writes the Flight entry too, which would hide a missing seed.
      write(root, "app/[locale]/contact/page.tsx", LOCALE_PAGE("contact", 2));

      const builder = await createBuilder({
        root,
        configFile: false,
        plugins: [vinext({ appDir: root })],
        logLevel: "silent",
      });
      await builder.buildApp();
      await runPrerender({ root });

      const { startProdServer } = await import("../packages/vinext/src/server/prod-server.js");
      ({ server } = await startProdServer({
        port: 0,
        outDir: path.join(root, "dist"),
        noCompression: true,
        silent: true,
      }));
      const address = server.address();
      baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    }, 180_000);

    afterAll(async () => {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      if (root) fs.rmSync(root, { recursive: true, force: true });
    });

    it("serves the prerendered destination URL as a cache hit", async () => {
      const response = await fetch(url("/en/about"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-vinext-cache")).toBe("HIT");
      const html = await response.text();
      expect(html).toContain("page:about:en");
      expect(html).toContain("pathname:/en/about");
    });

    it.each([
      ["/", "page:home:en"],
      ["/about", "page:about:en"],
      // The source parameter captures more than one path segment.
      ["/docs/intro", "page:docs/intro:en"],
    ])("serves the rewritten source URL %s as a cache hit", async (sourcePath, marker) => {
      const response = await fetch(url(sourcePath));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-vinext-cache")).toBe("HIT");
      const html = await response.text();
      expect(html).toContain(marker);
      // The entry must be the render of the source URL, not a copy of the
      // destination entry: usePathname() reports the URL in the address bar.
      expect(html).toContain(`pathname:${sourcePath}`);
      expect(html).not.toContain("pathname:/en");
    });

    it("serves the rewritten source URL Flight payload as a cache hit", async () => {
      const response = await fetch(url("/contact"), {
        headers: { Accept: "text/x-component", RSC: "1" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-vinext-cache")).toBe("HIT");
      expect(await response.text()).toContain("page:contact:en");
    });

    it("does not seed a source URL with the render of a page that another rule selects", async () => {
      // The build request for `/promo` resolves to `/en/about`. That render must
      // not fill the entry that a request with the cookie reads.
      const response = await fetch(url("/promo"), { headers: { Cookie: "seen=1" } });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-vinext-cache")).toBe("MISS");
      const html = await response.text();
      expect(html).toContain("page:contact:en");
      expect(html).not.toContain("page:about:en");
    });

    it("does not register the rewritten source URL as a prerendered path of the route", () => {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(root, "dist/server/vinext-prerender.json"), "utf8"),
      ) as { pregeneratedConcretePaths: Array<[string, string[]]> };
      const paths = new Map(manifest.pregeneratedConcretePaths).get("/:locale/about");
      expect([...(paths ?? [])].sort()).toEqual(["/en/about", "/es/about"]);
    });
  },
);
