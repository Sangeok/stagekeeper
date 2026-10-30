#!/usr/bin/env bash
set -euo pipefail
plugin="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p .stagekeeper-eval
cp -R "$plugin/evals/fixtures/templates" .stagekeeper-eval/templates
git init -q -b main
git config user.email eval@stagekeeper.invalid
git config user.name stagekeeper-eval
git remote add origin https://github.com/stagekeeper-eval/first-connection.git
printf '{ "name": "first-connection", "private": true, "scripts": { "test": "node --test" } }\n' > package.json
printf '.stagekeeper-eval/\n.eval-*\n' >> .git/info/exclude
git add -A
git commit -q -m "chore: start the repository"
git update-ref refs/remotes/origin/main HEAD
git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
touch .stagekeeper-eval/.baseline
