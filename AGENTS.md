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

## Branching and pull requests

`dev` is the integration branch; `main` is the release branch and holds only
commits that were already green on `dev`.

- Branch from `dev`, named `harness/<topic>`. Open the pull request against `dev`:
  `gh pr create --base dev`. The repository default branch is `main`, so without
  `--base` the pull request targets the wrong branch.
- A pull request into `dev` merges only when the `check` workflow is green.
- Promote `dev` to `main` by fast-forward only:
  `git switch main && git merge --ff-only dev && git push origin main`.
  Do not merge `dev` into `main` through the GitHub UI: that merge commit lands on
  `main` alone, and every release after it needs a back-merge to repair the split.
- **`dev` must never be the head of a pull request.** Besides the split above, this
  repository has `deleteBranchOnMerge` enabled, so merging a PR whose head is `dev`
  deletes `dev` — and the next session then branches from a stale local `origin/dev`
  that still reports itself up to date, which is how work gets built on a base that no
  longer exists. `git ls-remote --heads origin` is the authoritative check; recreate the
  branch with `git push origin main:dev` if it has already been deleted.
- Feature branches are deleted automatically when their pull request merges
  (`deleteBranchOnMerge` is on). That is intended — it keeps `harness/<topic>` branches
  from piling up — and `gh pr merge` needs no `--delete-branch`.
- Do not commit directly to `dev` or `main`.
