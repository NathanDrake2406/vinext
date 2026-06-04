function normalizeManifestFile(file: string): string {
  return file.startsWith("/") ? file.slice(1) : file;
}

export function manifestFileWithBase(file: string, base: string): string {
  const normalizedFile = normalizeManifestFile(file);
  if (!base || base === "/") return normalizedFile;

  // Vite's SSR manifest stores base-prefixed paths without a leading slash,
  // e.g. "docs/assets/app.js" for base "/docs/".
  const normalizedBase = normalizeManifestFile(base).replace(/\/+$/, "");
  if (!normalizedBase) return normalizedFile;
  if (normalizedFile.startsWith(normalizedBase + "/")) return normalizedFile;
  return normalizedBase + "/" + normalizedFile;
}

export function manifestFilesWithBase(files: string[], base: string): string[] {
  return files.map((file) => manifestFileWithBase(file, base));
}

/**
 * Collapse a basePath segment that was applied twice to a manifest file path.
 *
 * Vite+ bakes the configured `base` into emitted chunk fileNames on disk
 * (e.g. `docs/_next/static/chunk.js` for base `/docs/`), then prepends `base`
 * again when writing `ssr-manifest.json`, yielding a doubled prefix like
 * `docs/docs/_next/static/chunk.js`. That URL 404s because the asset is served
 * at `/docs/_next/static/chunk.js`. The on-disk fileName carries the basePath
 * exactly once, so the public URL must too.
 *
 * Only an exact `<base>/<base>/` prefix is collapsed, so a path that
 * legitimately starts with a single basePath segment is left untouched.
 */
export function collapseDuplicateBase(file: string, base: string): string {
  const normalizedFile = normalizeManifestFile(file);
  if (!base || base === "/") return normalizedFile;

  const normalizedBase = normalizeManifestFile(base).replace(/\/+$/, "");
  if (!normalizedBase) return normalizedFile;

  const doubledPrefix = `${normalizedBase}/${normalizedBase}/`;
  return normalizedFile.startsWith(doubledPrefix)
    ? normalizedFile.slice(normalizedBase.length + 1)
    : normalizedFile;
}
