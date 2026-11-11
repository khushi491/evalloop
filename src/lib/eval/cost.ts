/**
 * Standard OpenAI list price for `gpt-4o-mini` text tokens.
 *
 * Source: https://developers.openai.com/api/docs/models/gpt-4o-mini
 * Checked: 2026-11-11
 *
 *   input        $0.15  / 1M tokens
 *   cached input $0.075 / 1M tokens
 *   output       $0.60  / 1M tokens
 *
 * Batch and fine-tune rates are not used. Cached input is billed at the
 * cached rate only when the response reports `prompt_tokens_details.cached_tokens`.
 * Otherwise every prompt token uses the input rate, which does not under-count.
 * The integer rates below are micro-USD per 1M tokens (1 USD = 1_000_000 micro-USD)
 * and are the source of truth for the arithmetic.
 */
export const GPT_4O_MINI_PRICE = {
  model: "gpt-4o-mini",
  inputUsdPerMillion: 0.15,
  cachedInputUsdPerMillion: 0.075,
  outputUsdPerMillion: 0.6,
  inputMicroUsdPerMillion: 150_000,
  cachedInputMicroUsdPerMillion: 75_000,
  outputMicroUsdPerMillion: 600_000,
  source: "https://developers.openai.com/api/docs/models/gpt-4o-mini",
  checkedOn: "2026-11-11",
} as const;

const MICRO_USD = 1_000_000;

export interface CostUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens?: number;
}

export function roundUsd(amount: number): number {
  return Math.round(amount * MICRO_USD) / MICRO_USD;
}

function tokenCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function microFor(tokens: number, microUsdPerMillion: number): number {
  return Math.round((tokens * microUsdPerMillion) / MICRO_USD);
}

/** Estimated USD cost. Rounded to the nearest micro-USD (6 decimal places). */
export function estimateCostUsd(usage: CostUsage): number {
  const prompt = tokenCount(usage.prompt_tokens);
  const completion = tokenCount(usage.completion_tokens);
  const cached = Math.min(tokenCount(usage.cached_tokens ?? 0), prompt);
  const uncached = prompt - cached;
  const micro =
    microFor(uncached, GPT_4O_MINI_PRICE.inputMicroUsdPerMillion) +
    microFor(cached, GPT_4O_MINI_PRICE.cachedInputMicroUsdPerMillion) +
    microFor(completion, GPT_4O_MINI_PRICE.outputMicroUsdPerMillion);
  return micro / MICRO_USD;
}

export class BudgetExceededError extends Error {
  readonly spentUsd: number;
  readonly maxUsd: number;

  constructor(spentUsd: number, maxUsd: number) {
    super(
      `Estimated cost $${spentUsd} reached the --max-cost limit of $${maxUsd}.`
    );
    this.name = "BudgetExceededError";
    this.spentUsd = spentUsd;
    this.maxUsd = maxUsd;
  }
}
