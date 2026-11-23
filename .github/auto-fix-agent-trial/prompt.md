You are working unattended on a continuous integration runner. Nobody can answer questions during this run.

A check that runs after merges failed on this repository. The current directory is a checkout of the commit that failed, with its dependencies installed.

- Workflow file: {{workflow}}
- Job: {{job}}
- Failed step: {{step}}
- Log of the failed job: {{log}}

Find the cause of the failure and fix it in this checkout.

1. Read the log and the workflow file to learn what failed and how that step runs.
2. Try to reproduce the failure here by running the failing test the way the step runs it. A failure may be intermittent, so repeat the run and count how many runs fail.
3. Fix the cause. Then run the same reproduction again and count again.
4. Write your notes to {{notes}} before you finish. Use exactly these headings:
   - `## Cause`
   - `## Reproduced` (yes or no, and failed runs out of total runs)
   - `## Reproduction command` (one command line that can be run again from the repository root)
   - `## Change` (what you changed and why, or `none`)
   - `## After the change` (failed runs out of total runs)
   - `## Needs a person` (`no`, or the decision a person has to make)

Rules:

- Do not delete, skip or weaken an assertion, and do not add retries that only hide the failure.
- Do not change a product policy value, such as a time limit or a threshold in product code, to make a check pass. When the failure can only be fixed that way, change nothing, explain it under `## Needs a person`, and stop.
- Do not edit `.github/`, `AGENTS.md`, `CLAUDE.md`, `vercel.json` or `vercel.ts`.
- Keep the change as small as the cause allows. Do not change files unrelated to the failure.
- Do not commit, push or open a pull request. Leave your change uncommitted in the working tree.
- Work only from this checkout and the log. Do not look up this repository, its issues, its pull requests or newer versions of its code on the network.
- You have about 50 minutes. Write the notes file early and update it, so that it exists if time runs out.
