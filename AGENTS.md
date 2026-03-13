# vinext

Vite plugin that reimplements the Next.js API surface, targeting Cloudflare Workers.

## Commands

```bash
pnpm test tests/specific-file.test.ts    # Run targeted tests (always do this, not full suite)
pnpm test tests/nextjs-compat/           # Run compat test directory
pnpm run test:e2e                        # Playwright E2E (all projects)
pnpm run typecheck                       # TypeScript via tsgo
pnpm run lint                            # oxlint
pnpm run fmt                             # oxfmt (format)
pnpm run fmt:check                       # oxfmt (check only)
pnpm run build                           # Build the vinext package
```

Always run targeted tests during development. Full suite is ~2 min serial — let CI run it.

| Changed                    | Test files                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `shims/*.ts`               | `tests/shims.test.ts` + specific shim test (e.g. `tests/link.test.ts`)                   |
| `routing/*.ts`             | `tests/routing.test.ts`, `tests/route-sorting.test.ts`                                   |
| `entries/app-rsc-entry.ts` | `tests/app-router.test.ts`, `tests/features.test.ts`                                     |
| `server/dev-server.ts`     | `tests/pages-router.test.ts`                                                             |
| Caching/ISR                | `tests/isr-cache.test.ts`, `tests/fetch-cache.test.ts`, `tests/kv-cache-handler.test.ts` |
| Build/deploy               | `tests/deploy.test.ts`, `tests/build-optimization.test.ts`                               |

## Project Structure

```
packages/vinext/src/
  index.ts                # Main Vite plugin (resolveId, virtual modules)
  cli.ts                  # vinext CLI
  shims/                  # One file per next/* module
    unified-request-context.ts  # Single ALS for all per-request state
  routing/                # File-system route scanners
    app-router.ts         # Scans app/ directory
    pages-router.ts       # Scans pages/ directory
    route-trie.ts         # Trie-based route matching
  server/                 # SSR handlers, middleware, ISR
    dev-server.ts         # Dev handler (Pages + App Router)
    prod-server.ts        # Production Node.js server
    request-pipeline.ts   # Shared request lifecycle
    app-router-entry.ts   # App Router production entry
  entries/                # Code generators (emit JS strings, not runtime code)
    app-rsc-entry.ts      # Generates RSC entry (App Router)
    app-ssr-entry.ts      # Generates SSR entry
  cloudflare/             # KV cache handler, TPR
  config/                 # next.config.ts parsing, config matchers
  plugins/                # Internal Vite sub-plugins

tests/
  *.test.ts               # Vitest unit/integration tests
  fixtures/               # Test apps (pages-basic, app-basic, etc.)
  e2e/                    # Playwright tests

examples/                 # Deployed demo apps (Cloudflare Workers)
```

## Architecture

### Unified Request Context (single ALS)

All per-request state lives in one flat `UnifiedRequestContext` stored in a single `AsyncLocalStorage` on `globalThis` via `Symbol.for("vinext.unifiedRequestContext.als")`. This replaced 5-6 nested ALS scopes.

Carries: headers/cookies, navigation (pathname, searchParams, params), cache state, execution context, i18n, router state, head state.

Both RSC and SSR environments share `globalThis`, so the ALS scope propagates automatically.

**Exception:** `handleSsr` still receives `navContext` explicitly because SSR has a separate module graph — the SSR `navigation.ts` instance needs `setNavigationContext()` called with RSC-side values, otherwise `usePathname()`/`useSearchParams()` are null during SSR.

### RSC and SSR Are Separate Module Graphs

Separate Vite environments = separate module instances. Setting state in RSC doesn't affect SSR's copy. The unified ALS (shared via `globalThis`) solves this for most state, but navigation still requires explicit bridging at the `handleSsr` boundary.

### What `@vitejs/plugin-rsc` Does vs vinext

RSC plugin: `"use client"`/`"use server"` transforms, RSC stream serialization, multi-environment builds, CSS splitting, HMR, bootstrap injection.

vinext: file-system routing, request lifecycle (middleware → headers → redirects → rewrites → route), layout nesting, client navigation, caching (ISR, fetch cache, `"use cache"`), all `next/*` shims.

### Dev/Prod Server Parity

Request handling exists in multiple places that must stay in sync:

- `entries/app-rsc-entry.ts` — App Router (generates RSC entry)
- `server/dev-server.ts` — Dev handler (Pages + App Router)
- `server/prod-server.ts` — Production server (own middleware/routing/SSR)

When fixing a bug in one, check whether the same bug exists in the others.

### Three Context Abstractions

Different layers use different context types — don't confuse them:

- **`shims/unified-request-context.ts`** — ALS-backed, used by dev server and shims (the "real" per-request context)
- **`config/config-matchers.ts` `RequestContext`** — lighter type for redirect/rewrite/header matching in prod server
- **`shims/request-context.ts`** — execution context (waitUntil), imported by the generated RSC entry

### Virtual Module Resolution Quirks

- **Build-time root prefix:** Vite prefixes virtual IDs with project root in SSR builds. `resolveId` must handle both `virtual:vinext-server-entry` and `<root>/virtual:vinext-server-entry`.
- **`\0` prefix in client env:** RSC plugin's browser entry imports `\0`-prefixed IDs. Strip `\0` before matching.
- **Absolute paths required:** Virtual modules have no file location — all imports must be absolute.

### Production Builds

Must use `createBuilder()` + `builder.buildApp()`, not `build()`. Direct `build()` skips the RSC plugin's multi-environment pipeline.

### Next.js 15+ Thenable Params

`params`/`searchParams` are Promises in Next.js 15. vinext creates thenable objects: `Object.assign(Promise.resolve(params), params)` — works as both `await params` and `params.id`.

### ISR Architecture

ISR sits above `CacheHandler` (simple key-value store). ISR semantics in `server/isr-cache.ts`: stale-while-revalidate, dedup via `Map<string, Promise>`, tag invalidation (hard delete vs time-expiry returning stale). Pluggable via `setCacheHandler()`.

### Ecosystem Library Compat

Libraries importing `next/*.js` (with extension) work via `resolveId` stripping `.js`. Libraries depending on Next.js build plugins need custom shimming.

### next.config.ts `serverExternalPackages`

vinext propagates `serverExternalPackages` from `next.config.ts` to Vite's `ssr.external`, so packages that need Node.js built-ins (not bundled for Workers) are excluded from the SSR bundle automatically.

## Code Style

- Prefer Node.js built-in APIs over third-party packages
- Search the Next.js test suite before implementing features — port relevant tests with a link to the original
- Never push directly to main — always branch + PR
- Never use `gh pr merge --admin`
