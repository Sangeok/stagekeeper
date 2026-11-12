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
  `packages/core`. Keep shared GitHub URL parsing and construction in
  `packages/github`; follow `docs/architecture/github.md` for its dependency and
  plugin distribution boundaries.
- Do not create both root `app/` and `src/app/`; Next.js ignores `src/app/` in that
  state. Until the existing root `app/` is migrated as one operation, do not create a
  parallel `src/app/`.

Before adding, modifying, or moving tests, read and follow
`docs/architecture/test-writing.md` for writing criteria and
`docs/architecture/test-organization.md` for placement. Use
`docs/architecture/verification.md` for execution commands and CI integration.

For test placement:

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

When adding, removing or moving a CI job or a gate leg, update the CI coverage table
in `docs/architecture/verification.md` in the same change. Classify the check as
common (the result does not depend on the OS), per-OS (it can, so it runs on Windows
and macOS) or single-OS (with a reason). Add the job for the other supported OS in
that change, or name the missing OS in the table's unmet cell and leave a follow-up.
`npm run verify:ci-coverage`, part of `npm run check`, compares the workflows with
the table.

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
- At the start of each independent task, also list the open pull requests
  (`gh pr list --state open`) and read the proposals in `docs/proposals/active/`.
  Another session or machine may be changing the same files, or may own the decision
  you are about to make.
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
- Before pushing a follow-up commit to a task branch, confirm with a separate command
  that its pull request is still open (`gh pr view <number> --json state`). When it
  is already merged, start a new branch from the latest `dev` instead: the merged
  branch is deleted, and a push would recreate it outside any pull request.
- A pull request into `dev` merges only when the `check` workflow is green.
- Promote `dev` to `main` by fast-forward only, and name the commit. After
  `git fetch origin`, run `git push origin <sha>:refs/heads/main`, where `<sha>` is the
  full `origin/dev` commit the gates ran on. Git refuses that push unless it is a
  fast-forward. Do not promote through a local `dev` or `main` branch: on another
  machine it can be behind or ahead of the commit that was checked.
  Do not merge `dev` into `main` through the GitHub UI: that merge commit lands on
  `main` alone, and every release after it needs a back-merge to repair the split.
- Before promoting, run `npm run verify:plugin-version` and stop if it fails. When
  shipped `plugin/` files differ between `origin/main` and `origin/dev`, both plugin
  manifests must carry the same, higher version; otherwise the server deploys while
  installed plugins never update. When the commit being promoted is not the tip of
  `origin/dev`, check that commit with `npm run verify:plugin-version -- --head <sha>`.
- Before dispatching a promotion gate (`client-init-smoke`, `agent-eval`,
  `pipeline-smoke`), look up what already ran. `gh run list --commit <sha>` lists the
  runs of the `dev` commit being promoted, and `gh run list --workflow <gate>.yml`
  shows each gate's unfinished runs (any status other than `completed`). Reuse a
  finished green run of that commit instead of dispatching again, but only when its
  inputs match: the run's row in the gate record shows the `templatesCommit` and
  `scenario` it used. While a run of the same gate is unfinished, on any commit, wait
  for it, because a new dispatch on the same branch cancels a running
  `client-init-smoke` or `agent-eval`. `agent-eval` and `pipeline-smoke` use the same
  subscription, so also wait for either one before dispatching the other. When a gate
  job has been running for more than 30 minutes, tell the user and then cancel that
  run. Dispatch a gate only when the commit has no finished run of it with those
  inputs, or that run is not green.
- Every gate run on `dev` or `main` that was dispatched by hand or by schedule adds a
  row to the gate record (https://github.com/Sangeok/stagekeeper/issues/319). It also
  opens a `[gate] <workflow> <commit>` issue when the gate failed, a summary is
  missing, or a summary shows a nonzero `harnessErrors` or `stepRefusals`. Before
  promoting, read the rows of the commit being promoted. Stop while a `[gate]` issue
  for that commit is open: write the cause and the decision in it and close it first.
  Read the other open `[gate]` issues too, and stop when one concerns a change in this
  promotion. When only the `record` job of a gate run failed, re-run that job; it
  reuses the gate job's outputs and starts no model.
- Before promoting, run the `client-init-smoke` workflow on the `dev` commit being
  promoted (`gh workflow run client-init-smoke.yml --ref dev`), and also `agent-eval`
  when shipped `plugin/` files changed. Stop unless every job is green, and promote
  only the commit their summaries name. Both check plugin installation and init
  only; neither runs the pipeline.
- Before promoting, also run the `pipeline-smoke` workflow on that `dev` commit
  (`gh workflow run pipeline-smoke.yml --ref dev`) when
  `git diff --name-only origin/main origin/dev -- src/server/pipeline src/server/agents src/server/mcp packages/core/pipeline packages/core/templates plugin/skills/watch plugin/skills/background plugin/bin/harness-watch.mjs plugin/bin/harness-session.mjs plugin/bin/harness-background.mjs plugin/bin/harness-commit-guard.mjs plugin/hooks plugin/runtime plugin/lib/execution scripts/rehearsals/rehearse-client-init-smoke.ts scripts/rehearsals/rehearse-pipeline-smoke.ts scripts/rehearsals/pipeline-smoke-steps.mjs .github/workflows/pipeline-smoke.yml .github/actions/smoke-database`
  prints a file. Run it with `--field templates-ref=<templates branch>` before seeding
  a role-template change to production. When `agent-eval` is also needed, dispatch
  `pipeline-smoke` after it finishes, because both use the same subscription. It runs
  one backlog item from assignment to acceptance with a real model and the background
  runner. Stop unless it is green; rerun it once only when its summary shows a cause
  outside the change, such as a model API error or a runner that did not start.
  When a green summary shows a nonzero `harnessErrors` or `stepRefusals`, open the
  sealed transcripts before promoting, and fix the contract, hint or template wording
  first when it caused the refusal.
- Before promoting, check the production database's migrations; `npm run build`
  only generates the Prisma client. The local `.env` `DATABASE_URL` must point at a
  development database, never production, because `npm run db:migrate` changes its
  schema immediately. Pass the production connection string explicitly, for example
  `node --env-file=<production env file> node_modules/prisma/build/index.js migrate status`,
  and keep that file outside the repository. Apply pending migrations with
  `migrate deploy` before the `main` push. When a pending migration is not
  backward-compatible with the deployed `main` (it drops or renames objects or
  rewrites existing rows), run `migrate deploy` and the `main` push back to back.
- After the `main` push, confirm that production serves that commit. Wait until
  `gh api repos/Sangeok/stagekeeper/commits/<sha>/status --jq '.statuses[] | select(.context == "Vercel") | [.state, .target_url] | @tsv'`
  reports `success`. The deployment id is the last path segment of that `target_url`,
  and `curl -s https://stagekeeper.dev | grep -o 'dpl_[A-Za-z0-9]*' | sort -u` must
  print `dpl_` followed by the same id. A different id means production still serves
  an older deployment.
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
