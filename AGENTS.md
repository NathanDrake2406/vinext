# Agent Guidelines

<!-- vinext local token-saving overlay -->

This is Nathan's local lightweight overlay for Codex worktrees. The full upstream
manual is intentionally not loaded by default because it costs tokens on every
session. If a task needs the full project manual, inspect it on demand with:

```bash
git show HEAD:AGENTS.md
```

## Core Rules

- Gather evidence from the local repo, tests, live PR/check state, or Next.js
  references before changing code.
- Make the smallest coherent change that fixes the real issue. Avoid cosmetic
  churn and unrelated refactors.
- Preserve user changes. Do not reset, checkout, force-push, push to `main`, use
  `gh pr merge --admin`, or create manual changesets unless explicitly asked.
- For feature or bug work, verify Next.js behavior first: search `.nextjs-ref`
  tests/source when available, then use `gh` or docs only as needed.
- Keep dev/prod, app/pages router, Node/edge/Workers, cache, lifecycle, and
  public API compatibility in mind when touching shared request behavior.
- Avoid `any` in production TypeScript. Prefer narrowing, typed helpers,
  discriminated unions, `satisfies`, or local boundary assertions.
- Use existing repo utilities and patterns. Prefer Node built-ins before adding
  dependencies.

## Commands

Prefer targeted checks:

```bash
vp check tests/app-router.test.ts
vp test run tests/app-router.test.ts
vp test run tests/app-router.test.ts -t "route handler"
vp run vinext#build
```

Legacy scripts still work:

```bash
pnpm test tests/routing.test.ts
pnpm run check
pnpm run build
```

Do not run installs with `--no-frozen-lockfile`; ask Nathan if the lockfile must
be regenerated.

## Important Vinext Context

- vinext reimplements the Next.js API surface on Vite, primarily targeting
  Cloudflare Workers.
- Generated entry modules should stay thin. Move real runtime behavior into
  typed modules under `packages/vinext/src/server/*` and test helpers directly.
- RSC and SSR are separate Vite environments with separate module instances; pass
  per-request state explicitly across that boundary.
- Production builds require `createBuilder()` plus `builder.buildApp()`, not the
  plain Vite `build()` API.
- The repo currently resolves Vite through `@voidzero-dev/vite-plus-core`
  / Vite 8; prefer Rolldown/OXC-era config for new build-hook work.
- Next.js request order matters: config headers and redirects run before
  middleware; rewrites/filesystem/dynamic/fallback behavior follows the Next.js
  routing contract.

When the task is broad, risky, or policy-sensitive, read the full upstream
`AGENTS.md` from git before editing.
