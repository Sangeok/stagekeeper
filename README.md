# Stagekeeper

**A pipeline for your coding agents.** Your agents build. You set the rules.

Stagekeeper is a development pipeline service. Your Claude Code runs plan → verify →
implement → accept in your own repository; Stagekeeper holds the state, the ledger, and the
gates. You decide where the pipeline waits for you: two gates by default, and Pro and Max
can move or remove them. Acceptance and its record are part of every runnable pipeline.
Agents plan, validate, implement, and report with evidence, but they can't grant themselves
permission.

Stagekeeper never runs your agents. Your own Claude Code session connects to it over MCP
through the `harness` plugin that lives in this repository.

Read the [documentation](https://stagekeeper.dev/docs) or
[connect your first repository](https://stagekeeper.dev/docs/getting-started).

## Status

- **Implemented:** the web app, the agent and owner MCP servers, and the Claude Code plugin.
- **In verification:** Codex foreground, resume, and background adapters use the same
  server contracts, with native command backends on Windows and macOS. Public Codex release
  and cross-client acceptance are separate gates; see the
  [macOS report](./docs/test-reports/completed/2026-11-10-codex-macos-native-acceptance.md)
  and the [runtime report](./docs/test-reports/active/dual-client-runtime-report.md).
- **Packaging:** install bundles are not published yet, and the plugin source in this
  repository is not an install bundle. Installed from this source, the Claude Code plugin
  runs its helpers on the Node.js in your `PATH`. Codex on Windows and macOS needs an
  install bundle (`scripts/windows/package-windows-plugin.mjs`,
  `scripts/macos/package-plugin.mjs`).
- **No payments:** plans are granted manually and `/billing` is read-only.
- **Private templates:** the step bodies agents follow are not in this repository. They are
  kept in a private repository, published to the database, and served only to authenticated
  requests.

## How it works

```text
You, in the browser ── GitHub sign-in · backlog · Inbox · pipeline graph
        │
        ▼
Next.js web app ─────────► application services ─────────► PostgreSQL
(src/app, src/fsd)         (src/server)                     (the source of truth)
                                 ▲
                                 │ MCP over HTTP
                                 │ /api/mcp (agents) · /api/mcp/owner (owner token)
                                 │
Your Claude Code session + the harness plugin
        │ writes
        ▼
Your repository ── harness.json · runbook · agent stubs · plans · reports
```

### The cycle

| # | Step | Who |
| --- | --- | --- |
| 1 | **Proposed** — Discover work finds candidates, and Assign work picks one by the saved selection policy | `work-discoverer`, `work-assigner` agents |
| 2 | **Plan requested** — gate `before-plan` | **you** |
| 3 | **Plan** — `docs/plans/<KEY>.md` is written and its commit submitted | the workspace's dev agent |
| 4 | **Verified** — the plan is re-read against the code in a fresh context (Pro, Max) | `plan-verifier` agent |
| 5 | **Approved** — gate `before-implement` | **you** |
| 6 | **Implemented** — code changes, verify commands, and a report | the workspace's dev agent |
| 7 | **Accepted** — the result is reproduced and the acceptance record written | your session (the main loop) |

By default the pipeline stops for you at 2 and 5. You open a gate in the web **Inbox**, or
from your own session with an owner token. Everything else runs in your own Claude Code.

### Your pipeline, your gates

The order lives on the server as a per-project pipeline graph, not in runbook text, so the
server can enforce it. The rules are in `packages/app-core/pipeline/pipeline.mjs`.

- **Nodes:** `discover-work`, `assign-work`, `plan`, `verify`, `implement`, `impl-verify`,
  `qa`, `accept`, `doc-audit`, `scout`. `plan`, `implement`, and `accept` can't be removed.
  `scout`, `impl-verify`, and `qa` are opt-in. A pipeline saved now can't contain the older
  `propose` node; it uses `assign-work` instead.
- **Default graph:** Free runs `discover-work → assign-work → plan → implement → accept`.
  Pro and Max add `verify` before `implement` and `doc-audit` after `accept`.
- **Gates** are edges named `before-<node>`. The defaults are `before-plan`
  (**Request plan**) and `before-implement` (**Approve implementation**). On Pro and Max you
  add, move, and remove nodes and gates on the **Pipeline** tab.
- **No gate, no stop.** Where the graph has no gate, the server advances the item itself as
  actor `pipeline` and records the move in the ledger. Where there is a gate, only a person
  opens it.
- Each item stays on the graph version it started with.

### Agents

| Agent | Job | Plans |
| --- | --- | --- |
| `work-discoverer` | Adds evidence-backed candidates to the backlog at a `discover-work` node. Does not assign work | All |
| `work-assigner` | Picks one backlog item at an `assign-work` node by the saved selection policy and records why | All |
| `pm` | Proposes an item at the older `propose` node. Never reads or edits code | All |
| Workspace dev (e.g. `web-dev`) | One per workspace in `harness.json`. Writes the plan, then implements it once approved | All |
| `plan-verifier` | Verifies a plan in a fresh context and reports defects with evidence. Changes nothing | Pro, Max |
| `impl-verifier` | Re-reads an implementation against its approved plan and checks, in a disposable copy, that the promised tests catch the change | Pro, Max |
| `qa-verifier` | Runs browser QA against a test environment configured in `harness.json` | Pro, Max |
| `doc-auditor` | Checks whether what the docs claim about the code is still true. Reports only | Pro, Max |
| `feature-scout` | Adds up to three evidence-backed items to the backlog per run. Runs automatically when the backlog has no candidates (switch that off on the Pipeline tab), or as a `scout` node in the graph | All |

The **main loop** is your Claude Code session following the runbook. It dispatches agents,
records validation, and performs acceptance. Agents don't dispatch each other.

### What the server enforces

- **Agents can't open gates.** The agent MCP server (`/api/mcp`, server name `harness`) has
  no tool to approve a gate, send back, hold, discard, resume, or reopen an item, edit or
  remove backlog items, edit the pipeline, or issue tokens. The owner MCP server
  (`/api/mcp/owner`, server name `harness_owner`) has one tool, `gate_approve`, and accepts
  only owner tokens. Everything else is web-only. Tests in `src/server/mcp/` pin both tool
  sets.
- **No pass without a record.** A validation is recorded only after a `plan-verifier` pass is
  on the ledger for the latest plan submission, and an implementation report only after a
  verify step. **Approve implementation** approves the recorded plan commit; edits made
  later must be committed and resubmitted.
- **Done is not accepted.** `done` means the implementation span finished with evidence the
  server checked. Acceptance is a separate record (`acceptedAt`), written when the main loop
  has reproduced the change, rerun the verify commands, and submitted its acceptance report.
  A failed acceptance is recorded and waits for you to retry or reopen on the web.
- **At most two open items.** `board_propose` refuses a third, and an item on hold is
  resumed by you, not proposed again.
- **Step bodies stay on the server.** The plugin writes agent stubs. Each agent receives one
  step at a time from `agent_next` and returns its outcome with the receipt it was given.
  The run's cursor and its outcomes are recorded on the server (`AgentRun`,
  `AgentRunStep`).
- **Records stay.** Discarding an item or removing a backlog entry marks the row instead of
  deleting it, and every transition stays in the ledger.
- **State in one place, files in yours.** The board lives in Stagekeeper. Plans and reports
  are committed next to the code in your repository, and the board records their paths and
  commits.

### Item states

| Identifier | Label | Meaning |
| --- | --- | --- |
| `proposed` | Proposed | pm proposed it. Waiting for you to request a plan |
| `planning` | Planning | You requested a plan. dev is writing it |
| `in_review` | In review | The plan is submitted. Waiting for validation and your approval |
| `implementing` | Implementing | You approved. dev is changing code |
| `done` | Done | dev reported it finished. Accepted once the acceptance record is in |
| `on_hold` | On hold | Parked. Resume to continue |

Allowed transitions are defined in one place, `packages/app-core/pipeline/transitions.mjs`.

## Plans

Plans belong to the user, and every project follows its owner's plan.

| | Free | Pro | Max |
| --- | --- | --- | --- |
| Connected repositories | 1 | 5 | Unlimited |
| Workspaces per project | 1 | 10 | Unlimited |
| Backlog items per project | 10 | Unlimited | Unlimited |
| History window | 30 days | Unlimited | Unlimited |
| Verification agents (`plan-verifier`, `impl-verifier`, `qa-verifier`, `doc-auditor`) | No | Yes | Yes |
| Approve gates from your session (owner token) | No | Yes | Yes |
| Edit the pipeline graph | No | Yes | Yes |
| New agent runs per 5-hour window | 20 | 100 | Unlimited |
| Background runner | No | Yes | Yes |

- Limits come from `LIMITS` in `packages/shared/plans/limits.mjs`.
- The run limit never blocks resuming an agent run that is already open.
- The history window limits what the History tab shows; everything is stored.
- After a downgrade, projects over the limit are kept as **Not selected** and are read only.
  Nothing is deleted.
- MCP and plugin requests are limited to 1,200 per account and 300 per project in a
  10-minute window on every plan.

## Connect a repository (Claude Code)

You need your existing Claude Code installation and login, and a Stagekeeper server you can
sign in to. From the plugin source, the helpers run on the `node` in your `PATH`; on Windows
`bin/harness.ps1` starts them and uses an install bundle's runtime instead when one is present
(see [Status](#status)). The plugin includes the `reconciling-proposals-with-codebase` skill
that plan review relies on. Before it writes anything, `/harness:init` checks that the session
resolves a complete, compatible copy of it and stops if it doesn't
([contract](./plugin/skills/init/references/reconciliation-contract.md)).

The [setup guide](https://stagekeeper.dev/docs/getting-started) walks through the steps:
create a project, install the plugin, set the token the project page shows, and run
`/harness:init` in the repository. This section keeps what that guide leaves out.

```sh
claude plugin marketplace add Sangeok/stagekeeper
claude plugin install harness@stagekeeper-local
claude plugin list      # harness should be listed
```

To try the plugin for one session without installing, start Claude Code with
`claude --plugin-dir <path-to-stagekeeper>/plugin`, and pass the same flag again when you
restart after `/harness:init`. If Claude Code answers `Unknown command: /harness:init`,
the plugin isn't loaded in that session; a token doesn't fix that.

| Token | Issued on | Scope |
| --- | --- | --- |
| Project token `hs_…` | The project's **Tokens** tab | One repository. Keep it in the terminal that starts Claude Code |
| User token `hu_…` | **Tokens** in the page header (`/settings/tokens`) | Every repository you own, from one machine. The project comes from `project.slug` in `harness.json` |
| Owner token `ho_…` | The project's **Tokens** tab (Pro, Max) | Optional. Set `HARNESS_OWNER_TOKEN` to approve gates from your own session |

Put the project or user token in `HARNESS_TOKEN`; the page that issues it shows the exact
commands. Don't paste a token into the chat. A token can have an expiry; it stays valid
until then or until you revoke it.

`/harness:init` drafts `harness.json` (the project identity and its workspaces) and shows it
once for your corrections, generates the runbook and agent stubs from the templates your
plan includes, saves `HARNESS_SERVER`, and registers the `harness` MCP server once per
machine at user scope, plus `harness_owner` when `HARNESS_OWNER_TOKEN` is set. It then asks
you to restart Claude Code, checks the connection, and syncs the workspaces. With a user
token it can also register the repository for you, instead of creating the project on the
web first.

Commit the generated files (suggested message: `chore: connect to Stagekeeper`) and follow
the runbook from your session.

| Command | What it does | Plans |
| --- | --- | --- |
| `/harness:watch` | Keeps the open Claude Code session picking up ready steps, for example after you approve a gate on the web. It does not open gates or push for you | All |
| `/harness:background` | Runs the pipeline on this PC without a Claude Code window | Pro, Max |

What `/harness:init` writes:

| Path | Contents |
| --- | --- |
| `harness.json` | Project identity and workspaces: path, dev agent, verify commands |
| `CLAUDE.md` | The runbook, inside an init-managed marker block |
| `.claude/agents/*.md` | Agent stubs: role, tools, and the first instruction |
| `docs/plans/`, `docs/agents/` | Conventions and a template for plans and agent reports |
| `harness.lock.json` | Hashes of generated files. Reruns keep files you edited (`skip(modified)`) |

A minimal `harness.json` looks like this. Init fills in `project` from the server; never
invent a `slug`.

```json
{
  "version": 1,
  "project": { "owner": "your-org", "repo": "your-repo", "branch": "main", "name": "your-repo", "slug": "your-repo" },
  "workspaces": [
    { "id": "web", "path": ".", "agent": "web-dev", "verify": ["npm run lint", "npm test"] }
  ]
}
```

Optional workspace fields: `knowledge` (a doc the dev agent reads before writing a plan) and
`readOnly` (paths the dev agent must not change).

### Codex (in verification)

The Codex manifest (`plugin/.codex-plugin/plugin.json`) exposes `$harness-init`,
`$harness-run`, and `$harness-resume`:

```sh
codex plugin marketplace add Sangeok/stagekeeper
codex plugin add harness@stagekeeper-local
```

`$harness-background` starts a separate resident run. It needs a native install bundle on
macOS or Windows, and you start it explicitly.

This is not a supported release yet: automatic watch in a foreground Codex session is not
implemented, items at an `impl-verify` node continue in Claude Code, and permission isolation
and cross-client acceptance are still being verified. See [plugin/README.md](./plugin/README.md).

## Run the service locally

Requirements: Node.js 22 (the version CI uses), PostgreSQL, and a GitHub OAuth app.

```sh
npm ci                   # project dependencies, including Prisma's engines
cp .env.example .env     # then fill in the values below
npm run db:generate      # Prisma client in src/generated/prisma; needs no database
npm run db:migrate       # prisma migrate dev against DATABASE_URL
npm run dev              # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for a development database, not production: `db:migrate` changes its schema immediately. The server and migrations need it; `db:generate` and `build` don't |
| `AUTH_SECRET` | Auth.js secret, e.g. `openssl rand -base64 32` |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | GitHub OAuth app. Callback URL: `<your site>/api/auth/callback/github` (locally `http://localhost:3000/api/auth/callback/github`) |
| `HARNESS_PUBLIC_URL` | The service's public base URL. Token pages show `<HARNESS_PUBLIC_URL>/api/mcp`. Defaults to `http://localhost:3000`; set it at build time for production too |

- **Templates.** Before a repository can connect to your server, the `Template` table needs
  the agent templates. They come from the private `Sangeok/harness-templates` repository:
  clone it into `plugin/templates/` (ignored by git) and run `npm run seed:templates`, or
  point the command at another checkout with `npm run seed:templates -- --dir <path>`. A
  template set that includes the Codex runbook also needs
  `--snapshot <path outside this repository>`. Without templates, `GET /api/templates`
  answers 404 and `/harness:init` stops.
- **Plans.** Sign in once, then grant a plan:
  `npm run plan:grant -- <github-login> <free|pro|max> [note]`.
- **After pulling.** When a page fails with Prisma error `P2022` (a column does not exist
  in the current database), the code is ahead of your database. Run `npm run db:generate`
  and `npm run db:migrate`, then restart the dev server: it keeps one Prisma client for
  its lifetime and does not pick up a regenerated one.
- **Production database.** `build` does not run migrations. Apply them, seed templates,
  and grant plans on production with its connection string in a separate env file passed
  to Node, for example
  `node --env-file=<production env file> node_modules/prisma/build/index.js migrate deploy`
  or `node --env-file=<production env file> --import tsx scripts/grant-plan.ts <github-login> <plan>`.
  Values from `--env-file` take precedence over `.env`. Keep that file outside the
  repository: Next.js loads `.env.local` and `.env.production*` on its own.

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate`, then `next build` |
| `npm run start` | Serve the production build |
| `npm run check` | The CI static gate: `plugin/lib` sync check, ESLint and FSD/server boundaries, `docs:check`, `verify:ci-coverage`, `next typegen`, `tsc --noEmit`, architecture and project-availability tests |
| `npm run lint` | ESLint, then FSD and server boundary checks |
| `npm run docs:check` | Test-report front matter rules and every relative link in tracked Markdown (included in `check`) |
| `npm test` | Shared/app policy and recursive plugin runtime tests |
| `npm run test:web` | `src/**/*.test.ts` and `src/**/*.test.mjs` |
| `npm run test:server` | `tests/server/*.test.ts` with the server-only bootstrap |
| `npm run test:server:integration` | Integration tests on an isolated PostgreSQL; `TEST_DATABASE_URL` must name a `stagekeeper_test_*` database |
| `npm run sync:plugin-lib` | Sync the declared shared module closure into `plugin/lib` |
| `npm run db:generate` · `db:validate` · `db:migrate` | `prisma generate` · `prisma validate` · `prisma migrate dev` |
| `npm run pr -- status` | The registered task worktrees. `create`, `complete`, and the other task commands are described in [`AGENTS.md`](./AGENTS.md) |
| `npm run verify:plugin-version` | Before promoting `dev` to `main`: fails when shipped `plugin/` files changed without a higher, matching version in both plugin manifests |
| `npm run find:green-dev` | Prints the newest `origin/dev` commit whose post-merge workflows all passed |

The other scripts are in [`package.json`](./package.json); the boundary checks, test
commands, and repository scripts are described in
[verification](./docs/architecture/verification.md).

Tests use the built-in Node.js test runner (`node --test`), with `tsx` for TypeScript.

CI runs these checks on pull requests and on pushes to `dev` and `main`, on Node.js 22,
without a database except for one job that uses a disposable PostgreSQL service container.
A pull request into `dev` merges only when the job `check (required)` passes. Which workflow
covers which operating system is listed in
[verification](./docs/architecture/verification.md#ci-검사의-os-범위).

## Repository layout

```text
stagekeeper/
├── src/
│   ├── app/          # Next.js routes, special files, and the composition root
│   ├── fsd/          # Product frontend in Feature-Sliced Design layers:
│   │                 #   pages → widgets → features → entities → shared
│   ├── server/       # Application services: auth, pipeline, MCP, database
│   ├── generated/    # Generated Prisma client (gitignored)
│   └── proxy.ts      # Sends signed-out visitors of app pages to /login
├── packages/app-core/ # Pure product policy shared by web and server
├── packages/shared/   # Explicit common contracts shipped to the plugin
├── plugin/           # Claude Code and Codex plugin: skills, helper CLIs, runtime
│                     #   (lib/ contains the declared shared closure; runtime/ owns plugin implementation)
├── prisma/           # Schema and migrations
├── scripts/          # Repository checks, sync, and manual operations (not app runtime)
├── tests/            # Entrypoint and cross-module tests: browser/, plugin/, templates/,
│                     #   server/ (its integration/ needs PostgreSQL)
└── docs/             # Architecture, ADRs, proposals, investigations, test reports, conventions
```

Web routes: `/` (landing), `/docs`, `/login`, `/projects`, `/p/new`, `/settings/tokens`, `/billing`,
and per project `/p/<slug>` (Board) with `/inbox`, `/backlog`, `/pipeline`, `/history`,
`/tokens`, and `/items/<key>`.

| HTTP route | Purpose |
| --- | --- |
| `/api/mcp` | Agent MCP server (`hs_` and `hu_` tokens) |
| `/api/mcp/owner` | Owner MCP server (`ho_` tokens) |

The other routes under `src/app/api` serve init, the runner, GitHub sign-in, the optional
repository list, and its scheduled maintenance. The MCP tool contracts are in
[protocol](./docs/architecture/protocol.md).

## Contributing

Read [`docs/architecture/README.md`](./docs/architecture/README.md) before changing
application code. `docs/architecture/` is the source of truth for the current structure;
proposals describe future work.

[`AGENTS.md`](./AGENTS.md) holds the rules a change must follow: where code goes, how a
task branch and its worktree are created and closed, what must pass before a pull request
merges, and how `dev` is promoted to `main`. In short:

- Product frontend code goes in `src/fsd`, application services in `src/server`, app policy
  in `packages/app-core`, and contracts shipped to the plugin in `packages/shared`. The
  import rules are in [FSD rules](./docs/architecture/fsd.md) and
  [shared boundaries](./docs/architecture/shared-modules.md).
- Don't edit `plugin/lib/`. Change `packages/shared`, then run `npm run sync:plugin-lib`.
- Every string the product shows comes from
  [`docs/conventions/product-copy.md`](./docs/conventions/product-copy.md); copy-lock tests
  fail when a screen and the document disagree.
- `dev` is the integration branch and `main` is the release branch. Branch from `dev` as
  `harness/<topic>` and open pull requests against `dev` (`gh pr create --base dev`; the
  default branch is `main`). Don't commit directly to `dev` or `main`.
- `main` takes only commits already green on `dev`, by fast-forward, after the promotion
  gates in `AGENTS.md`.

## Documentation

Most documentation under `docs/` is written in Korean, the team's working language. The
product itself speaks English; see the product copy.

| Document | Contents |
| --- | --- |
| [Architecture](./docs/architecture/README.md) | Current structure and rules. Start here |
| [System overview](./docs/architecture/system-overview.md) | Actors, runtimes, data ownership |
| [FSD rules](./docs/architecture/fsd.md) | Layers, slices, public APIs, Server/Client boundaries |
| [Protocol](./docs/architecture/protocol.md) | MCP tool contracts, state machine, board record rules |
| [Invariants](./docs/architecture/invariants.md) | The eight invariants and three board rules |
| [Verification](./docs/architecture/verification.md) | Automated checks and repository scripts |
| [Test organization](./docs/architecture/test-organization.md) | Where tests live |
| [Rationale](./docs/architecture/rationale.md) | Why the rules exist |
| [Domain glossary](./CONTEXT.md) | Project, workspace, backlog item, board item, gate, and more |
| [Product copy](./docs/conventions/product-copy.md) | Every string users and agents see |
| [Design](./docs/conventions/design.md) | Design tokens and rules |
| [ADRs](./docs/ADR/README.md) | Architecture decision records |
| [Proposals](./docs/proposals/README.md) · [Investigations](./docs/investigations/README.md) · [Test reports](./docs/test-reports/README.md) | Planned work, investigations, and acceptance reports |
| [Plugin](./plugin/README.md) | The local Claude Code and Codex adapters |

## Operations: optional private repository list

The normal GitHub login, Public picker, URL registration and existing projects work without this integration.
The optional list uses a separate GitHub App with **Metadata read only** and user access tokens. Do not add `repo` to the normal login.
App visibility must permit other users and organizations to install it; this does not make their repositories public.

The list becomes available automatically when the App credentials, webhook secret and vault configuration below are valid.
There are no feature or operations-ready switches. Missing or invalid integration configuration leaves the list unavailable.
Before supplying the complete configuration in production, apply the additive Prisma migration
`20261023150000_optional_github_repository_list` and complete the deployment checks below.
Configure the App ID, slug and separate client credentials using `GITHUB_REPOSITORY_APP_ID`, `GITHUB_REPOSITORY_APP_SLUG`,
`GITHUB_REPOSITORY_APP_CLIENT_ID` and `GITHUB_REPOSITORY_APP_CLIENT_SECRET`. Use expiring user tokens,
`request_oauth_on_install=false` and `setup_on_update=true`, with these fixed URLs under `HARNESS_PUBLIC_URL`:

- OAuth callback: `/api/github/connection/callback`
- Installation setup: `/api/github/connection/installation`
- Webhook: `/api/github/webhook`; keep webhooks active. GitHub automatically sends `installation`, `installation_repositories`
  and `github_app_authorization` events; these do not require additional repository permissions or event subscriptions.

Supply a random webhook secret of at least 32 characters through `GITHUB_REPOSITORY_WEBHOOK_SECRET`.
Supply a separate vault keyring through `GITHUB_REPOSITORY_VAULT_KEYS` (a JSON object mapping key IDs to canonical base64-encoded 32-byte keys)
and select its active ID with `GITHUB_REPOSITORY_VAULT_ACTIVE_KEY`. Generate and store keys in the deployment secret manager; never reuse `AUTH_SECRET`, commit keys, or paste them into a PR.

On Vercel, [`vercel.json`](./vercel.json) schedules `GET /api/cron/github-maintenance` once a day (`0 18 * * *`, UTC).
A once-a-day entry deploys on every Vercel plan; on Hobby, Vercel may run it at any point within that hour.
Each run wakes the database, so the schedule stays daily: expired attempts and connections are already refused when they are read or used.
Set `CRON_SECRET` in the project's **Production** environment to a separately generated random secret of at least 32 characters
(for example, 32 random bytes encoded as 64 hex characters). Vercel supplies it in the `Authorization: Bearer ...` header.
The endpoint rejects missing/short configuration and unauthorized requests without running maintenance, never rotates vault keys,
and has a 300-second execution limit. Never reuse the webhook secret, vault key or `AUTH_SECRET` as `CRON_SECRET`.
The schedule runs only on Production deployments; environment variable changes require a new deployment.
See [Vercel Cron authentication and operations](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs).

For local development or a deployment outside Vercel, run `npm run github:maintenance -- --apply` manually or schedule it
at least once a day. The CLI uses `DATABASE_URL` and does not require `CRON_SECRET`.
Attempts and encrypted drafts expire after ten minutes;
delivery IDs expire after 24 hours. Expired rows cannot be read or used, and stay in the database until the next maintenance run.
Consumption/cancellation/disconnection removes the relevant secret fields immediately.
The browser stores only tab-local random flow/cancellation IDs in sessionStorage; draft content and GitHub credentials stay on the server.

Deploy `20261111150000_github_maintenance_indexes` before this maintenance implementation. Scheduled cleanup works in
bounded batches; its batch, round and time limits are listed in
[verification](./docs/architecture/verification.md#github-저장소-목록-운영-정리). Active connections are not paged through.
Stopping a connection also cancels its drafts and removes its installation records atomically.
Completed batches remain committed, so another invocation can continue after interruption without a saved cursor.

The JSON response includes `cleanupBatches` and `cleanupComplete`. If expired or temporarily locked records remain,
`cleanupComplete` is false and the Cron route logs a warning with counts only. Check these warnings and rerun the CLI
to drain an unusual backlog; persistent backlog means arrival volume exceeds the current budget and the schedule or capacity
must be adjusted. A daily schedule is not a guarantee that every expired row is removed within a day during overload or failures.
Explicit `--rotate` is a separate operator-controlled scan of credentials and drafts; the scheduled endpoint never performs it.

For rotation, add the new key alongside old keys, select the new active ID, run maintenance with `--apply --rotate`, and confirm no stored envelope references the old key before removing it.
Keep previous keys available until every instance has the new configuration and rotation succeeds. A missing old key makes the affected operation unavailable; it does not silently destroy recoverable ciphertext.
Use a stable HTTPS public origin in production. Redact code/state query parameters at the ingress/access-log layer; application logs contain only outcome classes and durations.

Use separate development and production GitHub Apps and vault keys. Local `.env` must point to a development database;
its `HARNESS_PUBLIC_URL` must match the development App callback/setup origin. Webhook delivery to a local server requires
a reachable development URL. Production uses a stable HTTPS origin with no path, query or fragment. Never copy production secrets into the repository.

For the production rollout:

1. Check production migration status with an explicit production connection string and deploy pending migrations.
2. Set `CRON_SECRET` and deploy this code. In Vercel Cron Jobs, run the job and verify a 200 response with cleanup counts.
   Monitor subsequent scheduled runs for non-200 responses and timeouts; failed cron runs are not automatically retried.
3. Verify App permissions/callbacks, key recovery/rotation, personal/organization/SSO authorization, revocation and rollback
   using a separate development App and database. Other users must authorize the App and install it for their selected repositories;
   an organization may require administrator approval. Login alone does not grant repository-list access.
4. Supply all seven `GITHUB_REPOSITORY_*` values and the production `HARNESS_PUBLIC_URL` in Vercel Production, then redeploy.
   Verify another account can connect, select an allowed private repository and register it; verify removed access disappears.

These deployment operations and live GitHub acceptance are separate from fixture and local DB tests. The App lists repository
metadata; the existing local agent still reads and changes source code using the user's local checkout and GitHub permissions.

For rollback, keep App credentials, vault keys, disconnect/webhook handlers and maintenance available to settle existing attempts and credentials.
Do not roll back to a version lacking those handlers until secrets, attempts, leases and deliveries are settled. Do not drop the new tables to roll back.
