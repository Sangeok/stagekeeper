<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repository architecture

Before changing application code, read `docs/architecture/README.md` and the linked
document for the area being changed. `docs/architecture/` is the source of truth for
the current repository structure; proposals describe future work and do not override
accepted architecture unless they explicitly update it.

For frontend code, follow `docs/architecture/fsd.md`:

- Keep Next.js route entrypoints and framework composition in `src/app` after the
  approved source-layout migration.
- Put product frontend code in `src/fsd` and preserve the dependency direction
  `pages -> widgets -> features -> entities -> shared`.
- Import another slice only through its public API. Keep same-layer slices isolated.
- Keep backend application services in `src/server` and pure shared policy in
  `packages/core`.
- Do not create both root `app/` and `src/app/`; Next.js ignores `src/app/` in that
  state. Until the existing root `app/` is migrated as one operation, do not create a
  parallel `src/app/`.

Run `npm run verify:fsd`, `npm run test:architecture`, and the relevant lint, type,
test, and build commands before completing a code change. Do not suppress an
architecture error without documenting and approving the exception in
`docs/architecture/verification.md`.
