import { glob, readFile } from "node:fs/promises";
import path from "node:path";
import { normalizePageExtensions } from "../routing/file-matcher.js";

const SERVER_ACTION_SOURCE_EXTENSIONS = ["js", "jsx", "ts", "tsx", "mjs", "mts", "cjs", "cts"];
const SERVER_ACTION_SCAN_EXCLUDED_ROOTS = new Set([
  ".git",
  ".next",
  ".output",
  ".refs",
  ".turbo",
  ".vinext",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

type CollectServerActionWarmupEntriesOptions = {
  root: string;
  pageExtensions?: readonly string[] | null;
};

function buildExtensionGlob(extensions: readonly string[]): string {
  return extensions.length === 1 ? extensions[0] : `{${extensions.join(",")}}`;
}

function toViteEntry(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function normalizeServerActionExtensions(pageExtensions?: readonly string[] | null): string[] {
  return [
    ...new Set([...SERVER_ACTION_SOURCE_EXTENSIONS, ...normalizePageExtensions(pageExtensions)]),
  ];
}

function shouldExcludeServerActionScanPath(name: string): boolean {
  const segments = name.split(/[\\/]+/).filter(Boolean);
  return (
    SERVER_ACTION_SCAN_EXCLUDED_ROOTS.has(segments[0] ?? "") || segments.includes("node_modules")
  );
}

function skipWhitespaceAndComments(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (
      char === " " ||
      char === "\t" ||
      char === "\n" ||
      char === "\r" ||
      char === "\f" ||
      char === "\v"
    ) {
      index++;
      continue;
    }

    if (char === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
        index++;
      }
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index++;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }

    return index;
  }

  return index;
}

function readDirectiveLiteral(
  source: string,
  start: number,
): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === quote) {
      return { value, end: index + 1 };
    }
    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped === undefined) {
        return null;
      }
      // This scanner only needs directive equality, not full JavaScript string semantics.
      value += escaped;
      index += 2;
      continue;
    }
    value += char;
    index++;
  }

  return null;
}

export function hasModuleUseServerDirective(source: string): boolean {
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (index < source.length) {
    index = skipWhitespaceAndComments(source, index);
    const directive = readDirectiveLiteral(source, index);
    if (!directive) {
      return false;
    }
    if (directive.value === "use server") {
      return true;
    }
    index = skipWhitespaceAndComments(source, directive.end);
    if (source[index] === ";") {
      index++;
    }
  }

  return false;
}

export async function collectServerActionWarmupEntries(
  options: CollectServerActionWarmupEntriesOptions,
): Promise<string[]> {
  const extensions = normalizeServerActionExtensions(options.pageExtensions);
  const pattern = `**/*.${buildExtensionGlob(extensions)}`;
  const entries: string[] = [];

  for await (const relativeFile of glob(pattern, {
    cwd: options.root,
    exclude: shouldExcludeServerActionScanPath,
  })) {
    const filePath = path.join(options.root, relativeFile);
    const source = await readFile(filePath, "utf8");
    if (hasModuleUseServerDirective(source)) {
      entries.push(toViteEntry(options.root, filePath));
    }
  }

  return entries.sort();
}

export function mergeServerActionWarmupEntries(
  userWarmup: readonly string[] | undefined,
  actionWarmup: readonly string[],
): string[] {
  return [...new Set([...(userWarmup ?? []), ...actionWarmup])];
}
