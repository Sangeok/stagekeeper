#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../.." && pwd)"
bash "$here/../rerun-asks-first/fixture.sh"
printf 'node "%s/bin/harness-init.mjs" --register\nnode "%s/bin/harness-init.mjs"\n' "$plugin" "$plugin" > .stagekeeper-eval/commands.txt
