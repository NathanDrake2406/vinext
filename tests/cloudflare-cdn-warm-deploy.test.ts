import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileSyncMock = vi.hoisted(() => vi.fn());
const UPLOADED_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const PREVIOUS_VERSION_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: execFileSyncMock };
});

let tmpDir: string;

function writeFile(relativePath: string, content: string): void {
  const fullPath = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf-8");
}

function formatFetchUrl(url: Parameters<typeof fetch>[0]): string {
  if (url instanceof URL) return url.href;
  if (typeof url === "string") return url;
  return url.url;
}

function versionedResponse(versionId = UPLOADED_VERSION_ID): Response {
  return new Response("ok", {
    status: 200,
    headers: { "x-vinext-worker-version": versionId },
  });
}

function warmupWranglerConfig(config: Record<string, unknown>): string {
  const env = config.env;
  const configuredEnv =
    env && typeof env === "object" && !Array.isArray(env)
      ? Object.fromEntries(
          Object.entries(env).map(([name, value]) => [
            name,
            {
              ...(value as Record<string, unknown>),
              version_metadata: { binding: "VINEXT_VERSION_METADATA" },
            },
          ]),
        )
      : undefined;
  return JSON.stringify({
    ...config,
    cache: { enabled: true, ...(config.cache as Record<string, unknown> | undefined) },
    version_metadata: { binding: "VINEXT_VERSION_METADATA" },
    ...(configuredEnv ? { env: configuredEnv } : {}),
  });
}

function currentDeploymentOutput(): string {
  return JSON.stringify({
    versions: [{ version_id: PREVIOUS_VERSION_ID, percentage: 100 }],
  });
}

function isStage(args: string[]): boolean {
  return args.includes(`${PREVIOUS_VERSION_ID}@100%`) && args.includes(`${UPLOADED_VERSION_ID}@0%`);
}

function isPromotion(args: string[]): boolean {
  return args.includes(`${UPLOADED_VERSION_ID}@100%`);
}

describe("Cloudflare CDN warmup deploy flow", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vinext-cdn-warm-deploy-test-"));
    execFileSyncMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => versionedResponse()),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects a named environment without its own metadata binding before upload", async () => {
    writeFile(
      "wrangler.jsonc",
      JSON.stringify({
        version_metadata: { binding: "VINEXT_VERSION_METADATA" },
        env: { staging: { name: "my-worker-staging", route: "staging.example.com/*" } },
      }),
    );
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], { env: "staging" })).rejects.toThrow(
      'requires a version_metadata binding named "VINEXT_VERSION_METADATA" in Wrangler environment "staging"',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a version_metadata binding with a non-default name", async () => {
    // The runtime only ever reads env.VINEXT_VERSION_METADATA (worker-version.ts),
    // so a differently named binding would silently never stamp responses.
    writeFile(
      "wrangler.jsonc",
      JSON.stringify({ version_metadata: { binding: "CUSTOM_VERSION" } }),
    );
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], {})).rejects.toThrow(
      'requires a version_metadata binding named "VINEXT_VERSION_METADATA" in the top-level Wrangler config',
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("rejects a deploy whose Worker cache is disabled before upload", async () => {
    writeFile(
      "wrangler.jsonc",
      JSON.stringify({
        name: "my-worker",
        cache: { enabled: false },
        version_metadata: { binding: "VINEXT_VERSION_METADATA" },
      }),
    );
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], {})).rejects.toThrow(
      "requires Cloudflare Workers caching to be enabled",
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("rejects cross-version caching before upload", async () => {
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({
        name: "my-worker",
        cache: { cross_version_cache: true },
      }),
    );
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], {})).rejects.toThrow(
      "requires cache.cross_version_cache to be false",
    );
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("uses an environment-local cache block instead of the inherited top-level block", async () => {
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({
        name: "my-worker",
        cache: { enabled: true, cross_version_cache: true },
        env: {
          staging: {
            name: "my-worker-staging",
            cache: { enabled: true },
          },
        },
      }),
    );
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) return currentDeploymentOutput();
      if (isStage(args)) return "Staged version\nhttps://my-worker-staging.workers.dev\n";
      if (isPromotion(args)) return "Promoted version\n";
      if (args.includes("triggers")) return "Triggers deployed\n";
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], { env: "staging" })).resolves.toMatchObject({
      warmed: true,
    });
  });

  it("stages, warms the exact route with a version override, then promotes", async () => {
    const events: string[] = [];
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({
        name: "my-worker",
        cache: { enabled: true },
        routes: [{ pattern: "app.example.com/*", zone_name: "example.com" }],
      }),
    );
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const override = new Headers(init?.headers).get("Cloudflare-Workers-Version-Overrides");
      events.push(`fetch:${formatFetchUrl(url)}:${override}`);
      return versionedResponse();
    });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        events.push("upload");
        return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\nhttps://stable.example.workers.dev\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\nhttps://stable.example.workers.dev\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    const result = await deployWithCdnWarmup(tmpDir, ["/", "/about"], {
      warmCdnConcurrency: 1,
    });

    expect(result).toEqual({ url: "https://stable.example.workers.dev", warmed: true });
    expect(events).toEqual([
      "upload",
      "status",
      "stage",
      `fetch:https://app.example.com/:my-worker="${UPLOADED_VERSION_ID}"`,
      `fetch:https://app.example.com/about:my-worker="${UPLOADED_VERSION_ID}"`,
      "promote",
      "triggers",
    ]);
  });

  it("uses the selected environment route and Worker name for the override", async () => {
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({
        name: "my-worker",
        route: "app.example.com/*",
        env: {
          staging: {
            name: "my-worker-staging-custom",
            route: "staging.example.com/*",
          },
        },
      }),
    );
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) return currentDeploymentOutput();
      if (isStage(args)) return "Staged version\nhttps://staging-worker.example.workers.dev\n";
      if (args.includes("triggers")) return "Triggers deployed\n";
      if (isPromotion(args)) return "Promoted version\n";
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await deployWithCdnWarmup(tmpDir, ["/"], { env: "staging" });

    expect(fetch).toHaveBeenCalledWith(
      new URL("https://staging.example.com/"),
      expect.objectContaining({
        headers: expect.any(Headers),
        redirect: "manual",
      }),
    );
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]![1]?.headers);
    expect(headers.get("Cloudflare-Workers-Version-Overrides")).toBe(
      `my-worker-staging-custom="${UPLOADED_VERSION_ID}"`,
    );
    for (const [, args] of execFileSyncMock.mock.calls as Array<[string, string[]]>) {
      expect(args).toEqual(expect.arrayContaining(["--env", "staging"]));
    }
  });

  it("warms workers.dev while the uploaded version remains at 0%", async () => {
    const events: string[] = [];
    writeFile("wrangler.jsonc", warmupWranglerConfig({ name: "workers-cache" }));
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      events.push(`fetch:${formatFetchUrl(url)}`);
      expect(new Headers(init?.headers).get("Cloudflare-Workers-Version-Overrides")).toBe(
        `workers-cache="${UPLOADED_VERSION_ID}"`,
      );
      return versionedResponse();
    });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        events.push("upload");
        return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\nhttps://workers-cache.vinext.workers.dev\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    const result = await deployWithCdnWarmup(tmpDir, ["/cached/intro"], {});

    expect(result).toEqual({ url: "https://workers-cache.vinext.workers.dev", warmed: true });
    expect(events).toEqual([
      "upload",
      "status",
      "stage",
      "fetch:https://workers-cache.vinext.workers.dev/cached/intro",
      "promote",
      "triggers",
    ]);
  });

  it("does not claim workers.dev is warm for a path-scoped production route", async () => {
    const events: string[] = [];
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({ name: "workers-cache", route: "app.example.com/api/*" }),
    );
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) return currentDeploymentOutput();
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\nhttps://workers-cache.vinext.workers.dev\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const warnSpy = vi.spyOn(console, "warn");
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/api/docs"], {})).resolves.toEqual({
      url: "https://workers-cache.vinext.workers.dev",
      warmed: false,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual(["stage", "promote", "triggers"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("path-scoped Worker routes"));
  });

  it("retries a failed override before promoting the uploaded version", async () => {
    const events: string[] = [];
    writeFile("wrangler.jsonc", warmupWranglerConfig({ name: "workers-cache" }));
    vi.mocked(fetch)
      .mockImplementationOnce(async () => {
        events.push("fetch:old-version");
        return versionedResponse(PREVIOUS_VERSION_ID);
      })
      .mockImplementationOnce(async () => {
        events.push("fetch:new-version");
        return versionedResponse(UPLOADED_VERSION_ID);
      });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        events.push("upload");
        return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\nhttps://workers-cache.vinext.workers.dev\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await deployWithCdnWarmup(tmpDir, ["/cached/intro"], { warmCdnRetries: 1 });

    expect(events).toEqual([
      "upload",
      "status",
      "stage",
      "fetch:old-version",
      "fetch:new-version",
      "promote",
      "triggers",
    ]);
  });

  it("promotes without a confirmed warm-up in non-strict mode, and says so instead of a plain success", async () => {
    const events: string[] = [];
    const warnSpy = vi.spyOn(console, "warn");
    writeFile("wrangler.jsonc", warmupWranglerConfig({ name: "workers-cache" }));
    vi.mocked(fetch).mockImplementation(async () => {
      events.push("fetch:old-version");
      return versionedResponse(PREVIOUS_VERSION_ID);
    });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        events.push("upload");
        return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\nhttps://workers-cache.vinext.workers.dev\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote-uploaded");
        return "Promoted version\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    const result = await deployWithCdnWarmup(tmpDir, ["/cached/intro"], { warmCdnRetries: 0 });

    // Every override request kept hitting the previous version, so the retries
    // exhaust without ever confirming the uploaded version served a response —
    // non-strict mode still promotes, but must report warmed: false rather than
    // silently treating the deploy as a confirmed warm success.
    expect(result).toEqual({
      url: "https://workers-cache.vinext.workers.dev",
      warmed: false,
    });
    expect(events).toEqual([
      "upload",
      "status",
      "stage",
      "fetch:old-version",
      "promote-uploaded",
      "triggers",
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("did not confirm all 1 path(s) served the uploaded version"),
    );
  });

  it("leaves the new version staged at 0% when strict warmup fails, without a restore mutation", async () => {
    const events: string[] = [];
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({ name: "my-worker", route: "app.example.com/*" }),
    );
    vi.mocked(fetch).mockImplementation(async () => {
      events.push("fetch:old-version");
      return versionedResponse(PREVIOUS_VERSION_ID);
    });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        events.push("upload");
        return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) {
        events.push("stage");
        return "Staged version\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(
      deployWithCdnWarmup(tmpDir, ["/"], {
        warmCdnRetries: 0,
        warmCdnStrict: true,
      }),
    ).rejects.toThrow(
      `the uploaded version (${UPLOADED_VERSION_ID}) is staged at 0% and was not promoted`,
    );
    // No restore/promote/triggers call: staging left the previous version at
    // 100% and the new one at 0%, which is already the safe state.
    expect(events).toEqual(["upload", "status", "stage", "fetch:old-version"]);
  });

  it("stages and promotes a fresh attempt after a prior warmup left a version staged", async () => {
    const events: string[] = [];
    const failedVersionId = "33333333-3333-4333-8333-333333333333";
    const stagingSplits: string[][] = [];
    let uploadAttempts = 0;
    let statusReads = 0;
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({ name: "my-worker", route: "app.example.com/*" }),
    );
    const fetchResponses: Array<() => Response> = [
      () => {
        events.push("fetch:old-version");
        return versionedResponse(PREVIOUS_VERSION_ID);
      },
      () => {
        events.push("fetch:new-version");
        return versionedResponse(UPLOADED_VERSION_ID);
      },
    ];
    vi.mocked(fetch).mockImplementation(async () => {
      const next = fetchResponses.shift();
      if (!next) throw new Error("Unexpected fetch call");
      return next();
    });
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) {
        uploadAttempts++;
        const versionId = uploadAttempts === 1 ? failedVersionId : UPLOADED_VERSION_ID;
        events.push(uploadAttempts === 1 ? "upload:first" : "upload:retry");
        return `Uploaded version ${versionId}\n`;
      }
      if (args.includes("status")) {
        events.push("status");
        statusReads++;
        return statusReads === 1
          ? currentDeploymentOutput()
          : JSON.stringify({
              versions: [
                { version_id: PREVIOUS_VERSION_ID, percentage: 100 },
                { version_id: failedVersionId, percentage: 0 },
              ],
            });
      }
      if (
        args.includes(`${PREVIOUS_VERSION_ID}@100%`) &&
        (args.includes(`${failedVersionId}@0%`) || args.includes(`${UPLOADED_VERSION_ID}@0%`))
      ) {
        events.push("stage");
        stagingSplits.push(args);
        return "Staged version\nhttps://stable.example.workers.dev\n";
      }
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote");
        return "Promoted version\nhttps://stable.example.workers.dev\n";
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(
      deployWithCdnWarmup(tmpDir, ["/"], {
        warmCdnRetries: 0,
        warmCdnStrict: true,
      }),
    ).rejects.toThrow("is staged at 0% and was not promoted");

    const result = await deployWithCdnWarmup(tmpDir, ["/"], {
      warmCdnRetries: 0,
      warmCdnStrict: true,
    });

    expect(result).toEqual({ url: "https://stable.example.workers.dev", warmed: true });
    expect(events).toEqual([
      "upload:first",
      "status",
      "stage",
      "fetch:old-version",
      "upload:retry",
      "status",
      "stage",
      "fetch:new-version",
      "promote",
      "triggers",
    ]);
    expect(stagingSplits[1]).not.toContain(`${failedVersionId}@0%`);
  });

  it("surfaces an actionable error when the promotion CLI call fails, without re-reading status or applying triggers", async () => {
    const events: string[] = [];
    writeFile(
      "wrangler.jsonc",
      warmupWranglerConfig({ name: "my-worker", route: "app.example.com/*" }),
    );
    vi.mocked(fetch).mockImplementation(async () => versionedResponse(UPLOADED_VERSION_ID));
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) {
        events.push("status");
        return currentDeploymentOutput();
      }
      if (isStage(args)) return "Staged version\nhttps://stable.example.workers.dev\n";
      if (args.includes("triggers")) {
        events.push("triggers");
        return "Triggers deployed\n";
      }
      if (isPromotion(args)) {
        events.push("promote-attempt");
        throw new Error("network blip during promote");
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], {})).rejects.toThrow(
      `Could not confirm the promotion of Worker version ${UPLOADED_VERSION_ID} succeeded`,
    );
    // Exactly one status read (before staging) and one promotion attempt — no
    // reconciling re-read of deployment status, and triggers never run.
    expect(events).toEqual(["status", "promote-attempt"]);
  });

  it("does not mutate canonical cache keys when a safe staging deployment is unavailable", async () => {
    writeFile("wrangler.jsonc", warmupWranglerConfig({ name: "workers-cache" }));
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) {
        return JSON.stringify({
          versions: [
            { version_id: PREVIOUS_VERSION_ID, percentage: 50 },
            { version_id: "33333333-3333-4333-8333-333333333333", percentage: 50 },
          ],
        });
      }
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], { warmCdnStrict: true })).rejects.toThrow(
      `requires the current deployment to contain exactly one version at 100%. Uploaded Worker version ${UPLOADED_VERSION_ID} remains undeployed`,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(execFileSyncMock).toHaveBeenCalledTimes(2);
  });

  it("reports trigger recovery after a non-strict direct promotion", async () => {
    writeFile("wrangler.jsonc", warmupWranglerConfig({ name: "workers-cache" }));
    execFileSyncMock.mockImplementation((_file: string, args: string[]) => {
      if (args.includes("upload")) return `Uploaded version ${UPLOADED_VERSION_ID}\n`;
      if (args.includes("status")) {
        return JSON.stringify({
          versions: [
            { version_id: PREVIOUS_VERSION_ID, percentage: 50 },
            { version_id: "33333333-3333-4333-8333-333333333333", percentage: 50 },
          ],
        });
      }
      if (isPromotion(args)) return "Promoted version\n";
      if (args.includes("triggers")) throw new Error("trigger update failed");
      throw new Error(`Unexpected Wrangler args: ${args.join(" ")}`);
    });
    const { deployWithCdnWarmup } =
      await import("../packages/cloudflare/src/cdn-warm-deployment.js");

    await expect(deployWithCdnWarmup(tmpDir, ["/"], {})).rejects.toThrow(
      "The uploaded Worker version was promoted to 100%, but applying triggers",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
