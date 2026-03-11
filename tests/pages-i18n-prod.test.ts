import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import path from "node:path";
import fsp from "node:fs/promises";
import os from "node:os";
import http from "node:http";
import vinext from "../packages/vinext/src/index.js";

interface NodeHttpResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

describe("Pages i18n domain routing (production)", () => {
  let tmpDir: string;
  let prodServer: http.Server;
  let prodPort: number;

  async function requestWithHost(
    requestPath: string,
    host: string,
    headers: Record<string, string> = {},
  ): Promise<NodeHttpResponse> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: prodPort,
          path: requestPath,
          method: "GET",
          headers: {
            Host: host,
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vinext-pages-i18n-prod-"));

    const rootNodeModules = path.resolve(import.meta.dirname, "../node_modules");
    await fsp.symlink(rootNodeModules, path.join(tmpDir, "node_modules"), "junction");

    await fsp.writeFile(
      path.join(tmpDir, "next.config.mjs"),
      `export default {
  i18n: {
    locales: ["en", "fr"],
    defaultLocale: "en",
    domains: [
      { domain: "example.com", defaultLocale: "en" },
      { domain: "example.fr", defaultLocale: "fr", http: true },
    ],
  },
};`,
    );

    await fsp.mkdir(path.join(tmpDir, "pages"), { recursive: true });
    await fsp.writeFile(
      path.join(tmpDir, "pages", "index.tsx"),
      `export default function Home() { return <h1>Home</h1>; }`,
    );
    await fsp.writeFile(
      path.join(tmpDir, "pages", "about.tsx"),
      `import Link from "next/link";
export function getServerSideProps({ locale, defaultLocale }) {
  return { props: { locale, defaultLocale } };
}
export default function About({ locale, defaultLocale }) {
  return <div><p id="locale">{locale}</p><p id="defaultLocale">{defaultLocale}</p><Link href="/about" locale="fr" id="switch-locale">Switch locale</Link></div>;
}`,
    );

    const outDir = path.join(tmpDir, "dist");
    await build({
      root: tmpDir,
      configFile: false,
      plugins: [vinext()],
      logLevel: "silent",
      build: {
        outDir: path.join(outDir, "server"),
        ssr: "virtual:vinext-server-entry",
        rollupOptions: { output: { entryFileNames: "entry.js" } },
      },
    });
    await build({
      root: tmpDir,
      configFile: false,
      plugins: [vinext()],
      logLevel: "silent",
      build: {
        outDir: path.join(outDir, "client"),
        manifest: true,
        ssrManifest: true,
        rollupOptions: { input: "virtual:vinext-client-entry" },
      },
    });

    const { startProdServer } = await import("../packages/vinext/src/server/prod-server.js");
    prodServer = await startProdServer({
      port: 0,
      host: "127.0.0.1",
      outDir,
    });
    const addr = prodServer.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to start production server");
    }
    prodPort = addr.port;
  }, 30000);

  afterAll(async () => {
    if (prodServer) {
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
    }
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  }, 15000);

  it("redirects the root path to the preferred locale domain", async () => {
    const res = await requestWithHost("/", "example.com", {
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    });

    expect(res.status).toBe(307);
    expect(res.headers.location).toBe("http://example.fr/");
  });

  it("preserves the search string on root locale redirects", async () => {
    const res = await requestWithHost("/?utm=campaign&next=%2Fcheckout", "example.com", {
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    });

    expect(res.status).toBe(307);
    expect(res.headers.location).toBe("http://example.fr/?utm=campaign&next=%2Fcheckout");
  });

  it("does not redirect unprefixed non-root paths for locale detection", async () => {
    const res = await requestWithHost("/about", "example.com", {
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    });

    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
  });

  it("renders locale-switcher links with the target locale domain during SSR", async () => {
    const res = await requestWithHost("/about", "example.com");

    expect(res.status).toBe(200);
    expect(res.body).toContain('href="http://example.fr/about" id="switch-locale"');
  });

  it("uses the matched domain default locale for request context", async () => {
    const res = await requestWithHost("/about", "example.fr");

    expect(res.status).toBe(200);
    expect(res.body).toContain('<p id="locale">fr</p>');
    expect(res.body).toContain('<p id="defaultLocale">fr</p>');
    expect(res.body).toContain('href="/about" id="switch-locale"');
    expect(res.body).toContain('"defaultLocale":"fr"');
    expect(res.body).toContain(
      '"domainLocales":[{"domain":"example.com","defaultLocale":"en"},{"domain":"example.fr","defaultLocale":"fr","http":true}]',
    );
  });
});

describe("Pages i18n domain routing with basePath (production)", () => {
  let tmpDir: string;
  let prodServer: http.Server;
  let prodPort: number;

  async function requestWithHost(
    requestPath: string,
    host: string,
    headers: Record<string, string> = {},
  ): Promise<NodeHttpResponse> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: prodPort,
          path: requestPath,
          method: "GET",
          headers: {
            Host: host,
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "vinext-pages-i18n-basepath-prod-"));

    const rootNodeModules = path.resolve(import.meta.dirname, "../node_modules");
    await fsp.symlink(rootNodeModules, path.join(tmpDir, "node_modules"), "junction");

    await fsp.writeFile(
      path.join(tmpDir, "next.config.mjs"),
      `export default {
  basePath: "/app",
  trailingSlash: true,
  i18n: {
    locales: ["en", "fr"],
    defaultLocale: "en",
    domains: [
      { domain: "example.com", defaultLocale: "en" },
      { domain: "example.fr", defaultLocale: "fr", http: true },
    ],
  },
};`,
    );

    await fsp.mkdir(path.join(tmpDir, "pages"), { recursive: true });
    await fsp.writeFile(
      path.join(tmpDir, "pages", "index.tsx"),
      `export default function Home() { return <h1>Home</h1>; }`,
    );
    await fsp.writeFile(
      path.join(tmpDir, "pages", "about.tsx"),
      `import Link from "next/link";
export function getServerSideProps({ locale, defaultLocale }) {
  return { props: { locale, defaultLocale } };
}
export default function About({ locale, defaultLocale }) {
  return <div><p id="locale">{locale}</p><p id="defaultLocale">{defaultLocale}</p><Link href="/about" locale="fr" id="switch-locale">Switch locale</Link></div>;
}`,
    );

    const outDir = path.join(tmpDir, "dist");
    await build({
      root: tmpDir,
      configFile: false,
      plugins: [vinext()],
      logLevel: "silent",
      build: {
        outDir: path.join(outDir, "server"),
        ssr: "virtual:vinext-server-entry",
        rollupOptions: { output: { entryFileNames: "entry.js" } },
      },
    });
    await build({
      root: tmpDir,
      configFile: false,
      plugins: [vinext()],
      logLevel: "silent",
      build: {
        outDir: path.join(outDir, "client"),
        manifest: true,
        ssrManifest: true,
        rollupOptions: { input: "virtual:vinext-client-entry" },
      },
    });

    const { startProdServer } = await import("../packages/vinext/src/server/prod-server.js");
    prodServer = await startProdServer({
      port: 0,
      host: "127.0.0.1",
      outDir,
    });
    const addr = prodServer.address();
    if (!addr || typeof addr === "string") {
      throw new Error("Failed to start production server");
    }
    prodPort = addr.port;
  }, 30000);

  afterAll(async () => {
    if (prodServer) {
      await new Promise<void>((resolve) => prodServer.close(() => resolve()));
    }
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    }
  }, 15000);

  it("preserves basePath and trailingSlash in root locale redirects", async () => {
    const res = await requestWithHost("/app/?utm=campaign", "example.com", {
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    });

    expect(res.status).toBe(307);
    expect(res.headers.location).toBe("http://example.fr/app/?utm=campaign");
  });

  it("renders locale-switcher links with basePath on cross-domain hrefs", async () => {
    const res = await requestWithHost("/app/about/", "example.com");

    expect(res.status).toBe(200);
    expect(res.body).toContain('href="http://example.fr/app/about" id="switch-locale"');
  });
});
