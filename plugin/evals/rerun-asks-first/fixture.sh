#!/usr/bin/env bash
set -euo pipefail
plugin="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p .stagekeeper-eval
cp -R "$plugin/evals/fixtures/templates" .stagekeeper-eval/templates
git init -q -b main
git config user.email eval@stagekeeper.invalid
git config user.name stagekeeper-eval
git remote add origin https://github.com/stagekeeper-eval/rerun-asks-first.git
cat > harness.json <<'JSON'
{
  "version": 1,
  "project": { "owner": "stagekeeper-eval", "repo": "rerun-asks-first", "branch": "main", "name": "rerun-asks-first", "slug": "rerun-asks-first" },
  "workspaces": [{ "id": "app", "path": ".", "agent": "dev", "verify": ["npm test"] }]
}
JSON
printf '{ "name": "rerun-asks-first", "private": true, "scripts": { "test": "node --test" } }\n' > package.json
HARNESS_TEMPLATES_DIR=.stagekeeper-eval/templates HARNESS_SERVER=https://stagekeeper.invalid node "$plugin/bin/harness-init.mjs" > /dev/null
printf '.stagekeeper-eval/\n.eval-shell-active\n.eval-managed-write\n' >> .git/info/exclude
git add -A
git commit -q -m "chore: connect to Stagekeeper"
touch .stagekeeper-eval/.baseline
