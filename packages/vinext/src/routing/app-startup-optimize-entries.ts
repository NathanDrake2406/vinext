import fs from "node:fs";
import path from "node:path";
import { findFileWithExts, type ValidFileMatcher } from "./file-matcher.js";
import { isParallelRouteSegment, isRouteGroupSegment } from "./utils.js";
import { normalizePathSeparators } from "../utils/path.js";

const APP_ROUTER_STARTUP_OPTIMIZE_CONVENTIONS = Object.freeze([
  "layout",
  "page",
  "route",
  "template",
  "loading",
  "error",
  "not-found",
  "forbidden",
  "unauthorized",
  "global-error",
  "global-not-found",
]);

const APP_ROUTER_SLOT_STARTUP_OPTIMIZE_CONVENTIONS = Object.freeze([
  "layout",
  "page",
  "default",
  "loading",
  "error",
]);

export type CollectAppRouterStartupOptimizeEntriesOptions = {
  root: string;
  appDir: string;
  matcher: ValidFileMatcher;
};

export function collectAppRouterStartupOptimizeEntries({
  root,
  appDir,
  matcher,
}: CollectAppRouterStartupOptimizeEntriesOptions): string[] {
  const entries = new Set<string>();

  function addConvention(dir: string, convention: string): void {
    const filePath = findFileWithExts(dir, convention, matcher);
    if (filePath) entries.add(toRelativeFileEntry(root, filePath));
  }

  function addConventions(dir: string, conventions: readonly string[]): void {
    for (const convention of conventions) {
      addConvention(dir, convention);
    }
  }

  function addSlotConventions(slotDir: string): void {
    // These are the slot fields discoverParallelSlots() can attach to the
    // active root render without walking visible URL segments.
    addConventions(slotDir, APP_ROUTER_SLOT_STARTUP_OPTIMIZE_CONVENTIONS);

    for (const entry of readStartupDirectoryEntries(slotDir)) {
      if (!isRouteGroupSegment(entry.name)) continue;
      // Slot root pages can live under transparent route groups:
      // app/@modal/(group)/page.tsx is still the root slot page.
      addSlotRouteGroupPage(path.join(slotDir, entry.name));
    }
  }

  function addSlotRouteGroupPage(dir: string): void {
    addConvention(dir, "page");

    for (const entry of readStartupDirectoryEntries(dir)) {
      if (isRouteGroupSegment(entry.name)) {
        addSlotRouteGroupPage(path.join(dir, entry.name));
      }
    }
  }

  function walkInvisibleRootTree(dir: string): void {
    addConventions(dir, APP_ROUTER_STARTUP_OPTIMIZE_CONVENTIONS);

    for (const entry of readStartupDirectoryEntries(dir)) {
      if (isRouteGroupSegment(entry.name)) {
        walkInvisibleRootTree(path.join(dir, entry.name));
      } else if (isParallelRouteSegment(entry.name)) {
        addSlotConventions(path.join(dir, entry.name));
      }
    }
  }

  walkInvisibleRootTree(appDir);
  return [...entries];
}

function readStartupDirectoryEntries(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function toRelativeFileEntry(root: string, absPath: string): string {
  return normalizePathSeparators(path.relative(root, absPath));
}
