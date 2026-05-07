import { parseAst, transformWithOxc } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizePathSeparators } from "../entries/runtime-entry-module.js";

type DevCssResolutionContext = {
  projectRoot: string;
  aliases: Record<string, string>;
  onParseError?: (filePath: string, error: unknown) => void;
  resolve?: (specifier: string, importerPath: string) => Promise<string | null | undefined>;
};

type DevCssImportsCacheEntry = {
  hrefs: Promise<string[]>;
  mtimeMs: number;
  size: number;
};

export type DevCssImportsCache = Map<string, DevCssImportsCacheEntry>;

const CSS_EXTENSIONS = new Set([
  ".css",
  ".less",
  ".sass",
  ".scss",
  ".styl",
  ".stylus",
  ".pcss",
  ".postcss",
  ".sss",
]);

function isSpecialCssRequest(specifier: string): boolean {
  return /[?&](?:raw|url|inline)(?:\b|=|&|$)/.test(specifier);
}

function isCssSpecifier(specifier: string): boolean {
  const [pathname] = specifier.split("?", 1);
  return CSS_EXTENSIONS.has(path.extname(pathname));
}

function pathToDevHref(filePath: string, projectRoot: string): string {
  const relative = path.relative(projectRoot, filePath).split(path.sep).join("/");
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `/${relative}`;
  }
  return `/@fs/${normalizePathSeparators(filePath)}`;
}

async function absolutePathOrRootHref(value: string, projectRoot: string): Promise<string> {
  const relative = path.relative(projectRoot, value);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return pathToDevHref(value, projectRoot);
  }
  try {
    await fs.access(value);
    return pathToDevHref(value, projectRoot);
  } catch {
    return value;
  }
}

function splitCssSpecifier(specifier: string): { pathname: string; query: string } {
  const [pathname, query = ""] = specifier.split("?", 2);
  return { pathname, query };
}

function resolveAliasSpecifier(pathname: string, aliases: Record<string, string>): string | null {
  let bestMatch: { find: string; replacement: string } | null = null;
  for (const [find, replacement] of Object.entries(aliases)) {
    if (pathname !== find && !pathname.startsWith(`${find}/`)) continue;
    if (!bestMatch || find.length > bestMatch.find.length) {
      bestMatch = { find, replacement };
    }
  }
  if (!bestMatch) return null;

  const suffix = pathname.slice(bestMatch.find.length);
  return `${bestMatch.replacement}${suffix}`;
}

async function resolveCssImportHref(
  specifier: string,
  importerPath: string,
  context: DevCssResolutionContext,
): Promise<string | null> {
  if (isSpecialCssRequest(specifier) || !isCssSpecifier(specifier)) return null;

  const { pathname, query } = splitCssSpecifier(specifier);
  let href: string | null = null;

  if (pathname.startsWith(".")) {
    href = pathToDevHref(path.resolve(path.dirname(importerPath), pathname), context.projectRoot);
  } else if (pathname.startsWith("/")) {
    href = await absolutePathOrRootHref(pathname, context.projectRoot);
  } else {
    const resolvedAlias = resolveAliasSpecifier(pathname, context.aliases);
    if (resolvedAlias) {
      href = path.isAbsolute(resolvedAlias)
        ? await absolutePathOrRootHref(resolvedAlias, context.projectRoot)
        : pathToDevHref(path.resolve(context.projectRoot, resolvedAlias), context.projectRoot);
    }
  }

  if (!href && context.resolve) {
    const resolvedPath = await context.resolve(pathname, importerPath);
    if (resolvedPath) href = await absolutePathOrRootHref(resolvedPath, context.projectRoot);
  }

  return href ? href + (query ? `?${query}` : "") : null;
}

async function collectStaticImportSpecifiers(
  filePath: string,
  source: string,
  onParseError: ((filePath: string, error: unknown) => void) | undefined,
): Promise<string[]> {
  let code: string;
  try {
    code = (await transformWithOxc(source, filePath, { sourcemap: false })).code;
  } catch (error) {
    onParseError?.(filePath, error);
    return [];
  }

  const ast = parseAst(code);
  const specifiers: string[] = [];
  for (const node of ast.body) {
    if (
      node.type !== "ImportDeclaration" &&
      node.type !== "ExportNamedDeclaration" &&
      node.type !== "ExportAllDeclaration"
    ) {
      continue;
    }
    if (!node.source) continue;
    const sourceValue = node.source.value;
    if (typeof sourceValue === "string") specifiers.push(sourceValue);
  }
  return specifiers;
}

async function collectCssImports(
  filePath: string,
  context: DevCssResolutionContext,
): Promise<string[]> {
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const hrefs: string[] = [];
  for (const specifier of await collectStaticImportSpecifiers(
    filePath,
    source,
    context.onParseError,
  )) {
    const href = await resolveCssImportHref(specifier, filePath, context);
    if (href) hrefs.push(href);
  }

  return hrefs;
}

async function getCachedCssImports(
  filePath: string,
  context: DevCssResolutionContext,
  cache: DevCssImportsCache,
): Promise<string[] | undefined> {
  let stats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stats = await fs.stat(filePath);
  } catch {
    cache.delete(filePath);
    return undefined;
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.hrefs;
  }

  const hrefs = collectCssImports(filePath, context);
  cache.set(filePath, { hrefs, mtimeMs: stats.mtimeMs, size: stats.size });
  return hrefs;
}

export async function collectDevCssHrefsForFiles(
  filePaths: readonly string[],
  context: DevCssResolutionContext,
  cache: DevCssImportsCache = new Map(),
): Promise<string[]> {
  const hrefsByFile = await Promise.all(
    filePaths.map(async (filePath) => (await getCachedCssImports(filePath, context, cache)) ?? []),
  );
  return [...new Set(hrefsByFile.flat())];
}
