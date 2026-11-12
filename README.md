[![CI](https://github.com/khushi491/evalloop/actions/workflows/ci.yml/badge.svg)](https://github.com/khushi491/evalloop/actions/workflows/ci.yml)

# EvalLoop

A self-improving agent that runs a task, evaluates its own output, patches its "policy," and re-runs to improve the score.

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Runner    │────>│  Evaluator  │────>│   Patcher   │
│  (LLM call) │     │ (scores 0-  │     │ (updates    │
│  Follows    │     │  100, finds │     │  policy to  │
│  policy)    │     │  violations)│     │  fix issues)│
└─────────────┘     └─────────────┘     └──────┬──────┘
       ^                                       │
       │            ┌─────────────┐            │
       └────────────│  Policy v+1 │<───────────┘
                    │  (improved) │
                    └─────────────┘

Loop runs until: score >= target (default 90) OR max attempts (default 5)
```

The in-app loop stops on the judge score. The evaluation harness uses the same loop, and it also waits until the hard checks below pass.

### The Self-Improving Loop

1. **Attempt 1**: Runner generates output following the initial policy (v1).
2. **Evaluate**: Evaluator scores the output (0-100) across 5 categories, flags violations.
3. **Patch**: Patcher analyzes violations and produces a policy update (add/remove rules, update style/checklist).
4. **Attempt 2..N**: Runner uses the improved policy. Repeat until target score or max attempts.

## Tech Stack

- **Frontend**: Next.js 16 (App Router) + TypeScript + TailwindCSS
- **UI Components**: Custom shadcn/ui-style components
- **Backend**: Next.js API routes
- **Storage**: SQLite via Prisma
- **Charts**: Recharts (score trend)
- **LLM**: OpenAI-compatible API (works with OpenAI, Anthropic proxy, local models)

## Setup

### Prerequisites

- Node.js 20.9+
- pnpm

### Install

```bash
git clone https://github.com/khushi491/evalloop.git
cd evalloop
pnpm install
```

### Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
DATABASE_URL="file:./dev.db"

# Simulation mode — works without an API key!
USE_SIMULATION=true
```

**Simulation mode** (`USE_SIMULATION=true`): The app runs with built-in mock data — no API key needed. The demo preset scores attempts 52, 72, 84, and 92, with outputs, violations, and policy patches.

**Real LLM mode** (`USE_SIMULATION=false`): Set a valid `OPENAI_API_KEY` and the app calls the LLM for real. `OPENAI_BASE_URL` and `OPENAI_MODEL` select any OpenAI-compatible endpoint.

| Provider | `OPENAI_BASE_URL` | `OPENAI_MODEL` |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |

Put the provider key in `OPENAI_API_KEY` (an OpenAI key, a Gemini key, or a Groq key). Gemini's OpenAI-compatible API is documented at [ai.google.dev/gemini-api/docs/openai](https://ai.google.dev/gemini-api/docs/openai). Groq's is documented at [console.groq.com/docs/openai](https://console.groq.com/docs/openai); `llama-3.3-70b-versatile` is one current chat model, and the [model list](https://console.groq.com/docs/models) is the source for others. The client strips a trailing slash from the base URL before it calls `/chat/completions`.

### Initialize Database

```bash
npx prisma migrate dev
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Testing

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm test` runs the Vitest suite. It covers policy patches, rubric scoring, schema checks, the execution loop, and the eval harness. Simulation mode is on and the LLM client is mocked, so the suite does not call an external API. CI runs those checks and a `pnpm eval -- --dry-run` smoke test. It does not call a paid API.

## Evaluation

The harness measures the same loop the app runs (`runImprovementLoop` in `src/lib/improvement-loop.ts`). The runner drafts, the evaluator scores, and the patcher updates the policy. In the app, that loop stops when the judge score reaches the target. In the harness, it stops only when the blended total reaches the target and every hard check passes, or when the attempt budget runs out.

Fixtures live in `evals/tasks/`. Seven are training tasks. Three are held out: `security-advisory`, `invoice-json`, and `status-update`. Each file has a prompt, the constraints in plain language, and hard checks that run in process: word limits, required headings and keywords, forbidden text, and JSON shape. Hard checks are recorded beside the judge. They are not added to the judge prompt. When any of them fail, those failures are included in the patcher input next to the judge feedback. Held-out prompts are still never sent to the patcher.

### What a run records

For each attempt the results JSON stores the hard-check pass rate, the judge rubric breakdown, the judge total (the same total the app stores), a blended total, token counts, estimated cost, and latency. Judge and hard-check numbers stay in their own columns. The blended total is `round((hard-check pass rate × 100 + judge score) / 2)`, so a failed hard check changes the total even when the judge score does not. The harness stops a training task when that total reaches the target and every hard check passes.

Every training task starts from the initial policy. The first scored attempt is the baseline. The last scored attempt is the result after self-improvement. `--runs N` repeats that loop; the report averages runs within a task, then averages tasks with equal weight.

Held-out prompts are never sent to the patcher. After training, the final policy from each training run is merged into one learned policy. A starting rule is dropped only when every training run dropped it. Rules any run added are appended. The word cap becomes the smallest cap from the initial policy and the training policies. Each held-out task is then drafted once under the initial policy and once under the learned policy.

Cost uses the per-model price table in `src/lib/eval/cost.ts`. `gpt-4o-mini` is input $0.15 / 1M tokens, cached input $0.075 / 1M tokens, output $0.60 / 1M tokens (checked 2026-11-11 against the OpenAI model page). Cached tokens use the cached rate only when the API reports them and the model has a price. Any other model, including Gemini and Groq, is reported as **free tier / unknown** and the estimated cost is $0. Those runs do not inherit the gpt-4o-mini rates. `--max-cost` defaults to 3 and applies to estimated spend in the current process. The suite stops before the next model call once that spend reaches the cap. The call already in flight is recorded, including when it crosses the cap.

Temperature is fixed at the product values: runner 0.4, evaluator 0.1, patcher 0.2. The CLI does not have a temperature flag.

### Planned model calls

Defaults are 7 training tasks, 3 held-out tasks, `--runs 1`, and `--max-attempts 3`. When no training attempt reaches the target early and no JSON reply needs a second parse, that is 68 model calls:

- training: `runs × tasks × (3 × maxAttempts − 1)` = 56
- held-out: `runs × tasks × 4` = 12

An earlier stop removes the calls that would have followed it. A high judge score does not stop the loop while a hard check is still failing, so a run can use the full attempt budget even when the judge already cleared 90. The patcher does not run after the attempt that ends a loop. A JSON parse retry adds one extra call for that reply. A 429 or 503 response is retried inside that call, with `Retry-After` when the header is a delay in seconds, and is not counted as an extra suite call.

### How to run

The CLI does not start Next.js or a database. It ignores `USE_SIMULATION`. A live run needs `OPENAI_API_KEY` in the environment. `OPENAI_BASE_URL` and `OPENAI_MODEL` select the provider and default to `https://api.openai.com/v1` and `gpt-4o-mini`. Gemini and Groq use the same two variables; see the table in Configure Environment.

`pnpm install` is enough to run the eval. `pnpm exec prisma generate` is for the app and for `pnpm test`; the eval command does not use Prisma.

```bash
pnpm eval -- --runs 1 --max-attempts 3 --max-cost 3
pnpm eval:report -- evals/results/<timestamp>.json
```

A free-tier daily request cap is about 20 calls for a model. `--max-calls` limits calls made in this process, and `--delay-ms` waits between them. `--resume` reads a previous results file, skips task attempts that already have a judge score and are either at the attempt limit or already meet the total and the hard checks, and continues the rest. Earlier calls do not count against the new call cap or the new cost cap. The new JSON is a full suite file, so the next resume uses that path. Replace `<timestamp>` with the file name the previous command printed.

```bash
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ \
OPENAI_MODEL=gemini-3.5-flash \
pnpm eval -- --runs 1 --max-attempts 3 --max-calls 20 --delay-ms 1000

OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ \
OPENAI_MODEL=gemini-3.5-flash \
pnpm eval -- --resume evals/results/<timestamp>.json --max-calls 20 --delay-ms 1000
```

`OPENAI_API_KEY` is read from the environment or from `.env`. Do not put the key on the command line. A variable set in the shell wins over `.env`.

Other flags: `--tasks id,id`, `--target 90`, `--out evals/results`, `--dry-run`, `--help`.

Dry run uses the built-in simulation client and does not need an API key:

```bash
pnpm eval -- --dry-run
```

Each live or dry run writes `evals/results/<timestamp>.json`. Those JSON files are gitignored. `evals/RESULTS.md` is the report a human checks in. It currently says the evaluation has not been run yet. `pnpm eval:report` replaces that file from a results JSON. Leave the placeholder in place until a real run exists, and do not type scores into it by hand.

The checked-in report, once a real run has been generated, is linked from this section: [evals/RESULTS.md](evals/RESULTS.md).

## Demo Flow (2 minutes)

1. Open the app at `localhost:3000`
2. Click **"Quick Demo"** on the dashboard — this creates and executes the "Double charge support reply" preset
3. Watch the run detail page auto-update as attempts are processed
4. Once complete, explore:
   - **Compare tab**: See Attempt 1 vs Best Attempt side-by-side
   - **Evaluator tab**: Score breakdown bars (0-5 per category) + violations list
   - **Policy Diff tab**: See what rules were added/removed between v1 and final version
   - **Score trend chart**: Watch scores improve across attempts
5. Try the **"Re-run"** button to run additional iterations
6. Go to **"/runs/new"** and try other presets or write your own task

### Demo Preset: Double Charge Support Reply

Task: Write a support reply to a customer who is angry about being charged twice. The agent must apologize once, not admit fault, ask for order ID + last 4 of card, offer refund/credit options, stay under 90 words, and maintain a calm confident tone.

In simulation mode the scores move from 52 to 72, 84, and 92 across four attempts by adding specific rules like "count words before finalizing" and "explicitly mention both refund AND credit."

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/runs` | Create a new run |
| `GET` | `/api/runs` | List recent runs |
| `GET` | `/api/runs/:id` | Get run detail with attempts + policies |
| `POST` | `/api/runs/:id/execute` | Execute the self-improving loop |
| `DELETE` | `/api/runs/:id` | Delete a run |

## Project Structure

```
src/
├── app/
│   ├── api/runs/          # API route handlers
│   ├── runs/new/          # New run form
│   ├── runs/[id]/         # Run detail page
│   ├── page.tsx           # Dashboard
│   └── layout.tsx         # Root layout
├── components/
│   ├── ui/                # shadcn/ui-style components
│   ├── score-chart.tsx    # Recharts score trend
│   ├── compare-view.tsx   # Attempt 1 vs Best comparison
│   ├── evaluator-view.tsx # Score breakdown + violations
│   └── policy-diff-view.tsx # Policy version diff
└── lib/
    ├── db.ts              # Prisma client singleton
    ├── llm.ts             # Provider-agnostic LLM client
    ├── prompts.ts         # Runner/Evaluator/Patcher prompt templates
    ├── policy.ts          # Policy patch application
    ├── schemas.ts         # Zod schemas + types
    ├── simulate.ts        # Simulation mode mock data
    ├── improvement-loop.ts # Shared runner → evaluator → patcher loop
    ├── execute.ts         # Persists the loop for a project run
    └── eval/              # Hard checks, cost, suite, and the results report
evals/
├── tasks/                 # Train and held-out fixtures
├── results/               # Timestamped results JSON (gitignored)
└── RESULTS.md             # Report generated from a results file
scripts/
├── eval.ts                # `pnpm eval`
└── eval-report.ts         # `pnpm eval:report`
```

## Data Models

- **ProjectRun**: A task configuration (title, task text, max attempts, target score)
- **Attempt**: A single attempt output with score and violations
- **PolicyVersion**: A versioned policy JSON (rules, style, checklist)

## License

MIT
