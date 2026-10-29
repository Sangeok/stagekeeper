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
- Keep app-owned fonts, licenses, provenance, and the image font loader together in
  `src/app/_fonts/`. The underscore marks a Next.js private folder excluded from routing.
- Put product frontend code in `src/fsd` and preserve the dependency direction
  `pages -> widgets -> features -> entities -> shared`.
- Import another slice only through its public API. Keep same-layer slices isolated.
- Keep backend application services in `src/server` and pure shared policy in
  `packages/core`.
- Do not create both root `app/` and `src/app/`; Next.js ignores `src/app/` in that
  state. Until the existing root `app/` is migrated as one operation, do not create a
  parallel `src/app/`.

For test placement, follow `docs/architecture/test-organization.md`:

- Do not put test files or test-only code directly in `src/` (alongside `app/`) or
  directly in `src/app/` (alongside `page.tsx`). Examples of forbidden paths include
  `src/proxy.test.ts`, `src/app/page.test.ts`, `src/app/robots.test.ts`, and
  `src/app/sitemap.test.ts`.
- Do not create test-only directories such as `tests/`, `__tests__/`, or `testing/`
  directly under either directory. This restriction takes precedence over the
  default rule of colocating tests with their target.
- Put product tests beside their owner in `src/fsd` or `src/server`. Put tests of
  framework entrypoints in a responsibility-specific directory under root `tests/`
  and ensure the test command discovers them.

Run `npm run verify:fsd`, `npm run verify:server`, `npm run test:architecture`, and the relevant lint, type,
test, and build commands before completing a code change. Do not suppress an
architecture error without documenting and approving the exception in
`docs/architecture/verification.md`.

## Code comments

- Do not add explanatory code comments, prose-only JSDoc, or test narration unless
  the user explicitly requests comments. Express intent through names, types, and
  code structure.
- Preserve functional metadata such as required JSDoc type annotations, compiler
  and tool directives, shebangs, generated markers, and license notices. Add such
  metadata only when required by the code or an existing repository contract.
- Keep removal of existing comments within the user's requested task scope.

## Branching and pull requests

`dev` is the integration branch; `main` is the release branch and holds only
commits that were already green on `dev`.

- **Highest priority: never delete local or remote `main` or `dev`.** This overrides
  every cleanup rule. Do not disable or bypass their deletion protection, and never
  include either branch in a deletion command, batch, or wildcard.
- At the start of each independent task and at task completion, run
  `npm run branches:cleanup -- --apply`. The script only deletes verified local
  `harness/<topic>` refs. Its default without `--apply` is a preview. Its safety
  checks and skip reasons are documented in `docs/architecture/verification.md`.
- Preserve dirty worktrees and additional commits. Do not stash, discard, force
  checkout, or remove a worktree to make cleanup pass. Use an isolated worktree
  for a new task when existing work must be preserved.
- Verify that remote `main` and `dev` exist and fetch the latest `dev` before
  creating a new `harness/<topic>` branch. If either protected remote branch is
  missing or cannot be verified, stop branch maintenance and report it.
- Branch from the latest `dev`, named `harness/<topic>`. Never reuse a merged task
  branch for an independent task. Open the pull request against `dev`:
  `gh pr create --base dev`. The repository default branch is `main`, so without
  `--base` the pull request targets the wrong branch.
- A pull request into `dev` merges only when the `check` workflow is green.
- Promote `dev` to `main` by fast-forward only:
  `git switch main && git merge --ff-only dev && git push origin main`.
  Do not merge `dev` into `main` through the GitHub UI: that merge commit lands on
  `main` alone, and every release after it needs a back-merge to repair the split.
- Before promoting, run `npm run verify:plugin-version` and stop if it fails. When
  shipped `plugin/` files differ between `origin/main` and `origin/dev`, both plugin
  manifests must carry the same, higher version; otherwise the server deploys while
  installed plugins never update.
- Before promoting, run the `e2e-smoke` workflow on the `dev` commit being promoted
  (`gh workflow run e2e-smoke.yml --ref dev`), and also `agent-eval` when shipped
  `plugin/` files changed. Stop unless every job is green, and promote only the
  commit their summaries name.
- **Neither `main` nor `dev` may be the head of a pull request.** Release promotion
  remains fast-forward only. The active GitHub ruleset `Keep dev and main` forbids
  deletion of both protected refs and has no bypass actors; retain that protection.
- Feature branches are deleted automatically when their pull request merges
  (`deleteBranchOnMerge` is on). That is intended — it keeps `harness/<topic>` branches
  from piling up — and `gh pr merge` needs no `--delete-branch`.
- A task is complete for branch cleanup only after its final tested commit is
  merged into `dev`. Creating or closing a PR is insufficient. Merge only within
  the user's authorized scope; never merge a PR merely to enable cleanup.
- The script preserves checked-out branches, including the current branch. After
  a confirmed merge, switch away only when local work is safely preserved, then
  run cleanup again. It does not switch branches or delete remote refs.
- Use the cleanup script for local task-branch deletion. Do not fall back to
  `git branch -D`, ad hoc ref deletion, or deletion based only on branch age,
  a missing remote ref, or `git branch --merged`. If evidence is incomplete or a
  command fails, preserve the branch and report the reason.
- Do not commit directly to `dev` or `main`.
