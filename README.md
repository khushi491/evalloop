# EvalLoop

A self-improving agent that runs a task, evaluates its own output, patches its "policy," and re-runs to improve the score. Built for hackathons to demonstrate autonomous agent self-improvement.

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

- Node.js 18+
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

**Simulation mode** (`USE_SIMULATION=true`): The app runs with realistic built-in mock data — no API key needed. The demo preset shows score progression from 52 to 92+ across 4 attempts with real-looking outputs, violations, and policy patches. Perfect for demos and hackathon judging.

**Real LLM mode** (`USE_SIMULATION=false`): Set a valid `OPENAI_API_KEY` and the app calls the LLM for real. Change `OPENAI_BASE_URL` to point to any OpenAI-compatible endpoint (Anthropic via proxy, Azure, Ollama, etc.).

### Initialize Database

```bash
npx prisma migrate dev
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

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

The agent typically starts at 60-75 and improves to 85-95+ across 3-5 attempts by adding specific rules like "count words before finalizing" and "explicitly mention both refund AND credit."

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
    └── execute.ts         # Core execution loop
```

## Data Models

- **ProjectRun**: A task configuration (title, task text, max attempts, target score)
- **Attempt**: A single attempt output with score and violations
- **PolicyVersion**: A versioned policy JSON (rules, style, checklist)

## License

MIT
