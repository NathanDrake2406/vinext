import fs from "node:fs";
import path from "node:path";
import {
  buildPregeneratedConcretePathTable,
  readPrerenderManifest,
} from "../server/prerender-manifest.js";
import { acknowledgeServerEntryMetadataRewrite } from "../server/prod-server.js";
import { escapeRegExp } from "../utils/regex.js";

const VINEXT_PREGEN_START = "/* __VINEXT_PREGENERATED_CONCRETE_PATHS_START__ */";
const VINEXT_PREGEN_END = "/* __VINEXT_PREGENERATED_CONCRETE_PATHS_END__ */";
const VINEXT_PREGEN_RE = new RegExp(
  `${escapeRegExp(VINEXT_PREGEN_START)}[\\s\\S]*?${escapeRegExp(VINEXT_PREGEN_END)}\\n?`,
  "g",
);

/**
 * Read the prerender manifest and inject pregenerated concrete paths into the
 * built App Router server bundle so the PPR fallback-shell guard is populated
 * at module init time without calling `seedMemoryCacheFromPrerender`.
 *
 * The paths are injected as `globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS`
 * wrapped in replaceable marker comments, and consumed by
 * `initPregeneratedPathsFromGlobals` in the generated RSC entry.
 *
 * Idempotent: repeated calls strip the previous injection before writing the
 * new one. If the manifest is missing, corrupt, or empty, any prior injection
 * is stripped and nothing new is written, failing closed to empty.
 */
export function injectPregeneratedConcretePaths(root: string): void {
  const workerEntry = path.resolve(root, "dist", "server", "index.js");
  if (!fs.existsSync(workerEntry)) return;

  const originalCode = fs.readFileSync(workerEntry, "utf-8");
  let code = originalCode.replace(VINEXT_PREGEN_RE, "");

  const manifestPath = path.join(root, "dist", "server", "vinext-prerender.json");
  const manifest = readPrerenderManifest(manifestPath);
  const table = buildPregeneratedConcretePathTable(manifest ?? {});

  if (table.length > 0) {
    const injection =
      `${VINEXT_PREGEN_START}\n` +
      `globalThis.__VINEXT_PREGENERATED_CONCRETE_PATHS = ${JSON.stringify(table)};\n` +
      `${VINEXT_PREGEN_END}\n`;
    code = injection + code;
  }

  if (code === originalCode) return;

  fs.writeFileSync(workerEntry, code);
  acknowledgeServerEntryMetadataRewrite(workerEntry);
}
