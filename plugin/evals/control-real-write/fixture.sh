#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../.." && pwd)"
bash "$here/../rerun-asks-first/fixture.sh"
printf '#!/usr/bin/env bash\nexec node "%s/bin/harness-init.mjs"\n' "$plugin" > .stagekeeper-eval/generate.sh
