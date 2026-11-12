# Reproducing the EvalLoop comparison

This file is the run book. It does not report scores. Every call count below is an **upper bound** from `pnpm sweep -- --estimate`: the loop does not stop early, and no JSON reply is parsed twice. A real run can be smaller. It can also be larger by one extra call when a JSON reply has to be parsed twice.

Nothing here has been run against a live model in this repository. `pnpm eval -- --dry-run` and `pnpm sweep -- --dry-run` use the simulation client. Figures built from those files are labeled mock.

## What is fixed for every method

- Temperatures stay at the product values and are written into the results: runner 0.4, evaluator 0.1, patcher 0.2. The self-refine reviser uses the runner temperature.
- `--seed N` is written into the results and sent as the integer `seed` field. Sample `k` (1-based) is sent `N + k - 1`. The runner, judge, and patcher on that sample share it.
- The shared per-task call budget is the full policy loop: `3 × maxAttempts − 1` model calls. `--max-attempts 2` gives a budget of 5. `--max-attempts 3` gives a budget of 8.
- `single-shot` uses one draft (runner + judge).
- `best-of-n` draws `floor(budget / 2)` independent drafts and keeps the highest judge score. Ties keep the earlier sample. The stopping rule does not end sampling early.
- `self-refine` revises the previous answer from the selected feedback and does not change the policy. It stops when the stopping rule hits or the draft cap is reached.
- `policy` is the EvalLoop loop. It is the only method that patches a policy and then scores held-out tasks under that frozen policy, with no further patching.
- Held-out prompts are never sent to the patcher.
- Patcher feedback is `critique-only`, `hard-checks-only`, or `both`. Single-shot and best-of-n do not read it. The matrix still records one cell for them: stopping `judge-only`, feedback `both`.
- Stopping is `judge-only` or `judge-and-hard`. Judge-only stops when the judge score reaches `--target` (default 90). Judge-and-hard also requires every hard check to pass and uses the blended total.

## Provider

The process environment selects the server. A shell variable wins over `.env`.

| Role | `EVAL_PROVIDER` | `OPENAI_BASE_URL` | `OPENAI_MODEL` | `OPENAI_API_KEY` |
| --- | --- | --- | --- | --- |
| Gemini | `gemini` (or omit; the URL is recognized) | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash` | the Gemini key, not on the command line |
| Local OpenAI-compatible server | `ollama` when the URL contains port `11434` | `http://localhost:11434/v1` | the model name that server has loaded | any non-placeholder value, such as `ollama` |

`response_format` is not sent. JSON is parsed out of the reply text, which is what an Ollama OpenAI-compatible endpoint accepts. Set `OPENAI_JSON_MODE=response_format` only for a server that implements that field. A 400 that mentions the field is retried once without it.

Each sweep line stores `provider`, `model`, and `baseUrl`. A Gemini run and a local run can share one JSONL file. They do not resume each other's cells.

## Task sets

`evals/tasks/` has 30 tasks: 20 train, 10 held out. Categories are `structured-output`, `constrained-writing`, `summarization`, and `code-regex`. Each category appears in both splits. Existing ids are unchanged, including the original held-out ids `invoice-json`, `security-advisory`, and `status-update`.

The minimal plan uses these eight ids, one category in each split:

- train: `support-double-charge`, `release-json`, `outage-summary`, `email-regex`
- held out: `status-update`, `invoice-json`, `interview-summary`, `phone-regex`

## Call upper bounds

Checked by `pnpm sweep -- --estimate --plan minimal --seeds 1,2,3 --max-attempts 2`.

Planning assumption, not a measured quota: the Gemini free tier is about 20 calls a day. Confirm the live quota before a run. This repository has not measured it. Use `--max-calls 18` so one invocation stays under that assumption.

| Slice | Tasks | Seeds | Attempts | Upper bound |
| --- | --- | --- | --- | --- |
| Gemini main comparison (`--compare gemini`) | minimal 8 | 3 | 2 | 348 |
| Local model, the other matrix cells (`--compare local`) | minimal 8 | 3 | 2 | 1020 |
| Full matrix on the minimal tasks | minimal 8 | 3 | 2 | 1368 |
| One policy cell, full fixture set | 30 | 1 | 3 | 200 |

The Gemini main cells are `single-shot`, `best-of-n`, `self-refine` with judge-and-hard and both feedback sources, and `policy` with judge-and-hard and both feedback sources.

348 calls at 18 calls per invocation is 20 invocations if nothing stops early. Resume the same file. The local upper bound is not a Gemini quota. Keep `--max-calls` on the local run too so one process stays bounded.

Per seed on the minimal set at `--max-attempts 2`:

- single-shot: 16
- best-of-n: 32
- self-refine, one condition: 32
- policy, one condition: 36

## Commands

Estimate only. No model calls:

```bash
pnpm sweep -- --estimate --plan minimal --seeds 1,2,3 --max-attempts 2
```

Dry run of one cheap cell. No API key:

```bash
pnpm sweep -- --dry-run --plan minimal --seeds 1 --methods single-shot \
  --max-attempts 1 --max-calls 4 --out evals/results/sweep-dry.jsonl
```

Gemini main comparison. Put the key in the environment, not on the command line. Repeat the same command after the process stops. Finished cells are skipped.

```bash
export OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
export OPENAI_MODEL=gemini-3.5-flash
export EVAL_PROVIDER=gemini
export OPENAI_API_KEY=...

pnpm sweep -- --compare gemini --plan minimal --seeds 1,2,3 \
  --max-attempts 2 --max-calls 18 --delay-ms 1000 \
  --out evals/results/sweep.jsonl
```

Local model, remaining conditions, same file:

```bash
export OPENAI_BASE_URL=http://localhost:11434/v1
export OPENAI_MODEL=llama3.2
export EVAL_PROVIDER=ollama
export OPENAI_API_KEY=ollama

pnpm sweep -- --compare local --plan minimal --seeds 1,2,3 \
  --max-attempts 2 --max-calls 50 \
  --out evals/results/sweep.jsonl
```

`llama3.2` is an example model tag. Use the tag the local server actually serves.

One live policy run of the full fixture set, outside the sweep:

```bash
pnpm eval -- --runs 1 --max-attempts 3 --max-calls 18 --seed 1
```

Figures and tables. A file with `dryRun: true`, and any mix that includes one, is labeled mock.

```bash
pnpm analyze -- --input evals/results/sweep.jsonl --out paper/figures
```

`paper/figures/` is gitignored except `.gitkeep`. Do not commit a mock figure as a result. `evals/RESULTS.md` stays the not-yet-run placeholder until `pnpm eval:report` is pointed at a live results file.

## What each figure uses

| File | Metric |
| --- | --- |
| `hard-check-by-method` | Final hard-check pass rate. Best-of-n uses the judge-selected sample. Others use the last scored attempt. |
| `judge-by-method` | Final judge score, same attempt choice. |
| `gap-by-iteration` | Judge score minus hard-check pass rate times 100, by attempt, for `policy` and `self-refine` only. |
| `heldout-transfer` | Learned minus initial on held-out tasks, policy method only. |
| `cost-per-point` | Tokens spent on the training run divided by hard-check percentage points gained. Runs with no gain are counted and left out of the ratio. USD uses the price table and is 0 when the model is free tier / unknown. |

Intervals are 1,000-sample bootstrap 95% percentile intervals of the unweighted mean across tasks, seeded and deterministic. One task produces a degenerate interval (low = high = mean). The tables say `n`.

## What is mock

- `pnpm test`, `pnpm eval -- --dry-run`, and `pnpm sweep -- --dry-run` never call a provider.
- Scores in a dry-run file come from the in-repo simulation client. They are not measurements.
- A live score does not exist in this repository yet. Do not type one into `evals/RESULTS.md` or into `paper/`.
