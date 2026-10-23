# Stagekeeper

**Approval gates for your coding agents.** Your agents build. You set the rules.

Stagekeeper is a development pipeline service. Your Claude Code runs plan → verify →
implement → accept in your own repository; Stagekeeper holds the state, the ledger, and the
gates. You own every approval gate. Agents propose, plan, validate, implement, and report
with evidence, but they can't grant themselves permission.

Stagekeeper never runs your agents. Your own Claude Code session connects to it over MCP
through the `harness` plugin that lives in this repository.

Read the [documentation](https://stagekeeper.dev/docs) or
[connect your first repository](https://stagekeeper.dev/docs/getting-started).

## Status

- **Implemented:** the web app, the agent and owner MCP servers, and the Claude Code plugin.
- **In verification:** a Codex adapter (foreground run and resume) and a resume contract
  shared by both clients are in the source tree. Permission isolation in live Codex
  sessions, cross-client acceptance, and release are still open, so Codex is not a supported
  client yet. See the [dual-client runtime report](./docs/test-reports/active/dual-client-runtime-report.md).
- **Packaging:** the release bar is that connecting a repository needs nothing beyond your
  existing client login and the plugin. On Windows the helpers run only on the verified
  Node.js runtime that an install bundle carries, and the bundle also carries the
  verification skill that plan review relies on. Bundles are built with
  `scripts/windows/package-windows-plugin.mjs` and are not published yet; the plugin source in this
  repository is not an install bundle.
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
| 1 | **Proposed** — an item is picked from the backlog | `pm` agent |
| 2 | **Plan requested** — gate `before-plan` | **you** |
| 3 | **Plan** — `docs/plans/<KEY>.md` is written and its commit submitted | the workspace's dev agent |
| 4 | **Verified** — the plan is re-read against the code in a fresh context | `plan-verifier` agent |
| 5 | **Approved** — gate `before-implement` | **you** |
| 6 | **Implemented** — code changes, verify commands, and a report | the workspace's dev agent |
| 7 | **Accepted** — the result is reproduced and the acceptance record written | your session (the main loop) |

By default the pipeline stops for you at 2 and 5. You open a gate in the web **Inbox**, or
from your own session with an owner token. Everything else runs in your own Claude Code.

### Your pipeline, your gates

The order lives on the server as a per-project pipeline graph, not in runbook text, so the
server can enforce it. The rules are in `packages/core/pipeline.mjs`.

- **Nodes:** `propose`, `plan`, `verify`, `implement`, `impl-verify`, `qa`, `accept`,
  `doc-audit`, `scout`. `plan`, `implement`, and `accept` can't be removed. `scout`,
  `impl-verify`, and `qa` are opt-in.
- **Default graph:** Free runs `propose → plan → implement → accept`. Pro and Max add
  `verify` before `implement` and `doc-audit` after `accept`.
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
| `pm` | Picks today's work from the backlog and proposes it. Never reads or edits code | All |
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

Allowed transitions are defined in one place, `packages/core/transitions.mjs`.

## Plans

Plans belong to the user, and every project follows its owner's plan.

| | Free | Pro | Max |
| --- | --- | --- | --- |
| Connected repositories | 1 | 5 | Unlimited |
| Workspaces per project | 1 | 10 | Unlimited |
| Backlog items per project | 10 | Unlimited | Unlimited |
| History window | 30 days | Unlimited | Unlimited |
| Report agents | `pm`, `feature-scout` | All six | All six |
| Approve gates from your session (owner token) | No | Yes | Yes |
| Edit the pipeline graph | No | Yes | Yes |
| New agent runs per 5-hour window | 20 | 100 | Unlimited |

- Limits come from `LIMITS` in `packages/core/entitlement.mjs`.
- The run limit never blocks resuming an agent run that is already open.
- The history window limits what the History tab shows; everything is stored.
- After a downgrade, projects over the limit are kept as **Not selected** and are read only.
  Nothing is deleted.
- MCP and plugin requests are limited to 1,200 per account and 300 per project in a
  10-minute window on every plan.

## Connect a repository (Claude Code)

You need your existing Claude Code installation and login, and a Stagekeeper server you can
sign in to. From the plugin source, the helpers run on the `node` in your `PATH` on macOS and
Linux; Windows needs an install bundle (see [Status](#status)). Before it writes anything,
`/harness:init` also checks that the session has a complete, compatible
`reconciling-proposals-with-codebase` skill, which plan review relies on, and stops if it
doesn't ([contract](./plugin/skills/init/references/reconciliation-contract.md)).

1. **Sign in with GitHub and create a project.** The new-project page lists your public
   repositories; paste the URL of a private one. Alternatively, issue a user token and let
   `/harness:init` register the repository for you.

2. **Install the plugin.**

   ```sh
   claude plugin marketplace add Sangeok/stagekeeper
   claude plugin install harness@stagekeeper-local
   claude plugin list      # harness should be listed
   ```

   To try it for one session without installing, start Claude Code with
   `claude --plugin-dir <path-to-stagekeeper>/plugin`, and pass the same flag again when you
   restart after `/harness:init`. If Claude Code answers `Unknown command: /harness:init`,
   the plugin isn't loaded in that session; a token doesn't fix that.

3. **Put a token in `HARNESS_TOKEN`.** The page that issues the token shows the exact
   commands. Don't paste a token into the chat.

   | Token | Issued on | Scope |
   | --- | --- | --- |
   | Project token `hs_…` | The project's **Tokens** tab | One repository. Keep it in the terminal that starts Claude Code |
   | User token `hu_…` | **Tokens** in the page header (`/settings/tokens`) | Every repository you own, from one machine. The project comes from `project.slug` in `harness.json` |
   | Owner token `ho_…` | The project's **Tokens** tab (Pro, Max) | Optional. Set `HARNESS_OWNER_TOKEN` to approve gates from your own session |

   A token can have an expiry; it stays valid until then or until you revoke it.

4. **Run `/harness:init`** in the repository. It:
   - drafts `harness.json` (the project identity and its workspaces) and shows it once for
     your corrections;
   - generates the runbook and agent stubs from the templates your plan includes;
   - saves `HARNESS_SERVER` and registers the `harness` MCP server once per machine at user
     scope, plus `harness_owner` when `HARNESS_OWNER_TOKEN` is set;
   - asks you to restart Claude Code, then checks the connection with `project_get` and
     syncs the workspaces with `project_sync`.

5. **Commit the generated files** (suggested message: `chore: connect to Stagekeeper`), then
   follow the runbook from your session. To keep a session picking up work after you approve
   gates on the web, run `/harness:watch`.

What `/harness:init` writes:

| Path | Contents |
| --- | --- |
| `harness.json` | Project identity and workspaces: path, dev agent, verify commands |
| `CLAUDE.md` | The runbook, inside an init-managed marker block |
| `.claude/agents/*.md` | Agent stubs: role, tools, and the first instruction |
| `docs/plans/`, `docs/agents/` | Conventions and a template for plans and agent reports |
| `harness.lock.json` | Hashes of generated files. Reruns keep files you edited (`skip(modified)`) |

A minimal `harness.json` looks like this. Init fills in `project` from the server; never
invent a `slug`. See [`examples/apch/harness.json`](./examples/apch/harness.json) for a fuller
one.

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

This is not a supported release yet: automatic Codex watch is not implemented, items at an
`impl-verify` node continue in Claude Code, and permission isolation and cross-client
acceptance are still being verified. See [plugin/README.md](./plugin/README.md).

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
| `DATABASE_URL` | PostgreSQL connection string. The server and migrations need it; `db:generate` and `build` don't |
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

## Development

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate`, then `next build` |
| `npm run start` | Serve the production build |
| `npm run check` | The CI static gate: `plugin/lib` sync check, ESLint and FSD/server boundaries, `next typegen`, `tsc --noEmit`, architecture and project-availability tests |
| `npm run lint` | ESLint, then FSD and server boundary checks |
| `npm run verify:fsd` | FSD boundary check only |
| `npm run verify:server` | Server module/public API and initialization boundary check |
| `npm run verify:plugin-version` | Before promoting `dev` to `main`: fails when shipped `plugin/` files changed without a higher, matching version in both plugin manifests |
| `npm run test:architecture` | `scripts/**/*.test.mjs` |
| `npm run test:scripts` | `scripts/**/*.test.mjs`, `scripts/**/*.test.ts` (included in `check`) |
| `npm test` | `packages/core` and `plugin/bin` tests |
| `npm run test:web` | `src/**/*.test.ts` and `src/**/*.test.mjs` |
| `npm run test:server` | `tests/server/*.test.ts` with the server-only bootstrap |
| `npm run test:server:integration` | Integration tests on an isolated PostgreSQL; `TEST_DATABASE_URL` must name a `stagekeeper_test_*` database |
| `npm run test:templates` | Private template tests; needs `plugin/templates/` |
| `npm run sync:plugin-lib` | Copy `packages/core` into `plugin/lib` after changing core |
| `npm run db:generate` · `db:validate` · `db:migrate` | `prisma generate` · `prisma validate` · `prisma migrate dev` |

Tests use the built-in Node.js test runner (`node --test`), with `tsx` for TypeScript.

CI ([`check.yml`](./.github/workflows/check.yml)) runs `npm run check`, `npm test`,
`npm run test:web`, `npm run test:server`, and `npm run build` in parallel on Node.js 22
for pushes and pull requests to `dev` and `main`, without a database. A separate job runs
`npm run test:server:integration` against a disposable PostgreSQL 18 service container
named `stagekeeper_test_ci`.
[`windows-role-runtime.yml`](./.github/workflows/windows-role-runtime.yml) builds and tests
the Windows role runtime on `dev` pushes and on pull requests that touch the runtime or its
build inputs.

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
├── packages/core/    # Pure rules with no dependencies: states, pipeline graph, plans, protocol
├── plugin/           # Claude Code and Codex plugin: skills, helper CLIs, runtime
│                     #   (lib/ is a synced copy of packages/core; don't edit it)
├── prisma/           # Schema and migrations
├── scripts/          # Repository checks, sync, and manual operations (not app runtime)
├── tests/server/     # Server-only and cross-module tests; integration/ needs PostgreSQL
├── examples/         # Example harness.json
└── docs/             # Architecture, ADRs, proposals, investigations, test reports, conventions
```

Web routes: `/` (landing), `/login`, `/projects`, `/p/new`, `/settings/tokens`, `/billing`,
and per project `/p/<slug>` (Board) with `/inbox`, `/backlog`, `/pipeline`, `/history`,
`/tokens`, and `/items/<key>`.

| HTTP route | Purpose |
| --- | --- |
| `/api/mcp` | Agent MCP server (`hs_` and `hu_` tokens) |
| `/api/mcp/owner` | Owner MCP server (`ho_` tokens) |
| `GET /api/templates` | Init: templates trimmed to the plan |
| `GET /api/project` | Init: the project identity for `harness.json` |
| `POST /api/projects` | Init: register a repository with a user token |
| `POST /api/runbook` | Init: report the generated runbook version |
| `/api/auth/*` | Auth.js (GitHub sign-in) |

## Contributing

Read [`docs/architecture/README.md`](./docs/architecture/README.md) before changing
application code. `docs/architecture/` is the source of truth for the current structure;
proposals describe future work.

- `src/app` owns URLs, Next.js special files, and composition. Product frontend code goes
  in `src/fsd`.
- FSD imports flow only `pages → widgets → features → entities → shared`. Slices on the same
  layer don't import each other, and other slices are imported only through their public API
  (`index.ts`, `index.tsx`, `index.server.ts`).
- `src/server` never imports `src/fsd`. `packages/core` depends on neither `src` nor npm
  packages; put a rule there when the UI, server, and plugin must share it.
- No top-level folders by technical kind (`components/`, `hooks/`, `utils/`, `types/`); keep
  code that changes together in one slice.
- Don't create a root `app/`: Next.js ignores `src/app/` when both exist, and the checker
  fails on it.
- Don't edit `plugin/lib/`. Change `packages/core`, then run `npm run sync:plugin-lib`;
  `npm run check` fails on drift.
- This repository uses Next.js 16, which has breaking changes. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next.js code (see [`AGENTS.md`](./AGENTS.md)).
- Every string the product shows comes from
  [`docs/conventions/product-copy.md`](./docs/conventions/product-copy.md); copy-lock tests
  fail when a screen and the document disagree.
- Before you finish a change, run `npm run verify:fsd`, `npm run verify:server`, `npm run test:architecture`, and the
  relevant lint, type, test, and build commands. An exception to an architecture check must
  be documented and approved in
  [`docs/architecture/verification.md`](./docs/architecture/verification.md).

Branches: `dev` is the integration branch and `main` is the release branch.

- Branch from `dev` as `harness/<topic>` and open pull requests against `dev` with
  `gh pr create --base dev`. The default branch is `main`, so without `--base` the pull
  request targets the wrong branch.
- A pull request into `dev` merges only when the `check` workflow is green.
- `main` takes only commits already green on `dev`, by fast-forward:
  `git switch main && git merge --ff-only dev && git push origin main`.
  Run `npm run verify:plugin-version` first: a shipped plugin change needs a higher,
  matching version in both plugin manifests, or installed plugins never update.
- Never open a pull request with `dev` as its head, and don't commit directly to `dev` or
  `main`.

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
