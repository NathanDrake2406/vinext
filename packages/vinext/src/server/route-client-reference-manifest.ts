import fs from "node:fs/promises";
import path from "node:path";
import { parseAst, transformWithOxc } from "vite";
import { forEachAstChild, isAstRecord, isIdentifierNamed } from "../plugins/ast-utils.js";
import { collectAppRouteModuleFiles, type AppRoute } from "../routing/app-router.js";
import { normalizePathSeparators, stripViteModuleQuery } from "../utils/path.js";
import { normalizeClientReferenceImportId } from "./client-reference-imports.js";

export {
  createClientReferenceImportIndex,
  normalizeClientReferenceImportId,
  resolveClientReferenceIdsForImportCandidates,
} from "./client-reference-imports.js";

export type RouteClientReferenceResolutionContext = {
  projectRoot: string;
  globalSeedFiles?: readonly string[];
  onParseError?: (filePath: string, error: unknown) => void;
  resolve?: (specifier: string, importerPath: string) => Promise<string | null | undefined>;
};

type SourceScan = {
  candidates: readonly string[];
  complete: boolean;
  sourceImports: readonly string[];
};

type RouteClientReferenceCandidateEntry = {
  routeId: string;
  importCandidates: readonly string[] | null;
};

export type RouteClientReferenceCandidateManifest = {
  dependencies: readonly string[];
  routes: Readonly<Record<string, RouteClientReferenceCandidateEntry>>;
};

export type RouteClientReferenceScanCache = Map<string, Promise<SourceScan>>;

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"];
const STATIC_ASSET_EXTENSIONS = new Set([
  ".css",
  ".less",
  ".sass",
  ".scss",
  ".styl",
  ".stylus",
  ".pcss",
  ".postcss",
  ".sss",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

function routeClientReferenceId(route: AppRoute): string {
  return route.ids?.route ?? route.pattern;
}

function isSourceFilePath(filePath: string): boolean {
  return SOURCE_EXTENSIONS.includes(path.extname(stripViteModuleQuery(filePath)));
}

function isStaticAssetPath(value: string): boolean {
  return STATIC_ASSET_EXTENSIONS.has(path.extname(stripViteModuleQuery(value)));
}

function isSyntheticReactRuntimeSpecifier(specifier: string): boolean {
  return specifier === "react/jsx-runtime" || specifier === "react/jsx-dev-runtime";
}

function isNodeModulesPath(filePath: string): boolean {
  return normalizePathSeparators(filePath).split("/").includes("node_modules");
}

function isInProjectRoot(filePath: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isScannableProjectSource(filePath: string, projectRoot: string): boolean {
  return (
    isSourceFilePath(filePath) &&
    isInProjectRoot(filePath, projectRoot) &&
    !isNodeModulesPath(filePath)
  );
}

async function existingFilePath(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function resolveSourceCandidate(candidatePath: string): Promise<string | null> {
  if (path.extname(candidatePath)) {
    return existingFilePath(stripViteModuleQuery(candidatePath));
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const filePath = await existingFilePath(`${candidatePath}${extension}`);
    if (filePath) return filePath;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const filePath = await existingFilePath(path.join(candidatePath, `index${extension}`));
    if (filePath) return filePath;
  }

  return null;
}

function isImportCallee(value: unknown): boolean {
  return isAstRecord(value) && value.type === "Import";
}

function isCommonJsModuleLoadCallee(value: unknown): boolean {
  if (isIdentifierNamed(value, "require") || isIdentifierNamed(value, "createRequire")) {
    return true;
  }
  if (!isAstRecord(value) || value.type !== "MemberExpression") {
    return false;
  }
  const object = value.object;
  const property = value.property;
  return (
    isIdentifierNamed(object, "require") ||
    (isIdentifierNamed(object, "module") && isIdentifierNamed(property, "require"))
  );
}

function hasUnsupportedModuleLoadingExpression(value: unknown): boolean {
  if (!isAstRecord(value)) return false;
  const node = value;
  if (node.type === "ImportExpression") {
    return true;
  }
  if (node.type === "CallExpression" && isImportCallee(node.callee)) {
    return true;
  }
  if (node.type === "CallExpression" && isCommonJsModuleLoadCallee(node.callee)) {
    return true;
  }

  let found = false;
  forEachAstChild(node, (child) => {
    if (found) return;
    found = hasUnsupportedModuleLoadingExpression(child);
  });

  return found;
}

async function collectStaticImportSpecifiers(
  filePath: string,
  source: string,
  onParseError: ((filePath: string, error: unknown) => void) | undefined,
): Promise<{ complete: boolean; specifiers: string[] }> {
  let code: string;
  try {
    code = (await transformWithOxc(source, filePath, { sourcemap: false })).code;
  } catch (error) {
    onParseError?.(filePath, error);
    return { complete: false, specifiers: [] };
  }

  let ast: ReturnType<typeof parseAst>;
  try {
    ast = parseAst(code);
  } catch (error) {
    onParseError?.(filePath, error);
    return { complete: false, specifiers: [] };
  }

  let complete = true;
  const specifiers: string[] = [];
  for (const node of ast.body) {
    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration"
    ) {
      const sourceValue = node.source?.value;
      if (typeof sourceValue === "string") specifiers.push(sourceValue);
      continue;
    }

    if (hasUnsupportedModuleLoadingExpression(node)) {
      complete = false;
    }
  }

  return { complete, specifiers };
}

async function resolveImportSpecifier(
  specifier: string,
  importerPath: string,
  context: RouteClientReferenceResolutionContext,
): Promise<{ complete: boolean; candidates: string[]; sourceImport: string | null }> {
  const candidates = new Set<string>();
  let complete = true;
  let sourceImport: string | null = null;
  const pathname = stripViteModuleQuery(specifier);

  if (!pathname || isStaticAssetPath(pathname) || isSyntheticReactRuntimeSpecifier(pathname)) {
    return { complete, candidates: [], sourceImport };
  }

  if (!pathname.startsWith(".") && !pathname.startsWith("/")) {
    candidates.add(pathname);
  }

  let resolvedPath: string | null = null;
  const requiresProjectResolution = pathname.startsWith(".") || pathname.startsWith("/");
  if (context.resolve) {
    const resolved = await context.resolve(pathname, importerPath);
    if (resolved) {
      resolvedPath = await resolveSourceCandidate(resolved);
      candidates.add(resolved);
    }
  } else if (pathname.startsWith(".")) {
    resolvedPath = await resolveSourceCandidate(path.resolve(path.dirname(importerPath), pathname));
  } else if (pathname.startsWith("/")) {
    resolvedPath = await resolveSourceCandidate(pathname);
  }

  if (requiresProjectResolution && !resolvedPath) {
    complete = false;
  }

  if (resolvedPath) {
    candidates.add(resolvedPath);
    if (isScannableProjectSource(resolvedPath, context.projectRoot)) {
      sourceImport = resolvedPath;
    } else if (!isStaticAssetPath(resolvedPath)) {
      complete = false;
    }
  } else if (!requiresProjectResolution) {
    complete = false;
  }

  return { complete, candidates: [...candidates], sourceImport };
}

async function scanSourceFile(
  filePath: string,
  context: RouteClientReferenceResolutionContext,
): Promise<SourceScan> {
  const candidates = new Set<string>([normalizeClientReferenceImportId(filePath)]);
  const sourceImports: string[] = [];

  if (!isSourceFilePath(filePath)) {
    return { candidates: [...candidates], complete: false, sourceImports };
  }

  let source: string;
  try {
    source = await fs.readFile(filePath, "utf-8");
  } catch {
    return { candidates: [...candidates], complete: false, sourceImports };
  }

  const imports = await collectStaticImportSpecifiers(filePath, source, context.onParseError);
  let complete = imports.complete;

  for (const specifier of imports.specifiers) {
    const resolved = await resolveImportSpecifier(specifier, filePath, context);
    complete &&= resolved.complete;
    for (const candidate of resolved.candidates) {
      candidates.add(normalizeClientReferenceImportId(candidate));
    }
    if (resolved.sourceImport) {
      sourceImports.push(resolved.sourceImport);
    }
  }

  return { candidates: [...candidates], complete, sourceImports };
}

function getCachedSourceScan(
  filePath: string,
  context: RouteClientReferenceResolutionContext,
  cache: RouteClientReferenceScanCache,
  dependencies: Set<string>,
): Promise<SourceScan> {
  const normalizedPath = normalizeClientReferenceImportId(filePath);
  dependencies.add(normalizedPath);
  const existing = cache.get(normalizedPath);
  if (existing) return existing;

  const scan = scanSourceFile(filePath, context);
  cache.set(normalizedPath, scan);
  return scan;
}

async function collectCandidatesForRoute(
  route: AppRoute,
  context: RouteClientReferenceResolutionContext,
  cache: RouteClientReferenceScanCache,
  dependencies: Set<string>,
): Promise<readonly string[] | null> {
  const pendingFiles = [
    ...(context.globalSeedFiles ?? []),
    ...collectAppRouteModuleFiles(route, { includeRouteHandler: false }),
  ];
  const seenFiles = new Set<string>();
  const candidates = new Set<string>();

  while (pendingFiles.length > 0) {
    const filePath = pendingFiles.shift();
    if (!filePath) continue;

    const normalizedPath = normalizeClientReferenceImportId(filePath);
    if (seenFiles.has(normalizedPath)) continue;
    seenFiles.add(normalizedPath);

    const scan = await getCachedSourceScan(filePath, context, cache, dependencies);
    if (!scan.complete) return null;
    for (const candidate of scan.candidates) {
      candidates.add(candidate);
    }
    for (const sourceImport of scan.sourceImports) {
      pendingFiles.push(sourceImport);
    }
  }

  return [...candidates].sort();
}

export async function buildRouteClientReferenceCandidateManifest(
  routes: readonly AppRoute[],
  context: RouteClientReferenceResolutionContext,
  cache: RouteClientReferenceScanCache = new Map(),
): Promise<RouteClientReferenceCandidateManifest> {
  const dependencies = new Set<string>();
  const entries = await Promise.all(
    routes.map(async (route) => {
      const routeId = routeClientReferenceId(route);
      const importCandidates = await collectCandidatesForRoute(route, context, cache, dependencies);
      return [routeId, { routeId, importCandidates }] as const;
    }),
  );

  return { dependencies: [...dependencies].sort(), routes: Object.fromEntries(entries) };
}

export function getRouteClientReferenceImportCandidatesInRouteOrder(
  manifest: RouteClientReferenceCandidateManifest,
  routes: readonly AppRoute[],
): readonly (readonly string[] | null)[] {
  return routes.map(
    (route) => manifest.routes[routeClientReferenceId(route)]?.importCandidates ?? null,
  );
}
