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
export interface TokenPrice {
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  inputMicroUsdPerMillion: number;
  cachedInputMicroUsdPerMillion: number;
  outputMicroUsdPerMillion: number;
  source: string;
  checkedOn: string;
  /** False for the free-tier / unknown case. Estimated cost is then $0. */
  known: boolean;
}

export const GPT_4O_MINI_PRICE: TokenPrice = {
  model: "gpt-4o-mini",
  inputUsdPerMillion: 0.15,
  cachedInputUsdPerMillion: 0.075,
  outputUsdPerMillion: 0.6,
  inputMicroUsdPerMillion: 150_000,
  cachedInputMicroUsdPerMillion: 75_000,
  outputMicroUsdPerMillion: 600_000,
  source: "https://developers.openai.com/api/docs/models/gpt-4o-mini",
  checkedOn: "2026-11-11",
  known: true,
};

/**
 * Used for every model that does not have an entry in the price table.
 * Gemini and Groq free-tier runs land here, so they are not billed as gpt-4o-mini.
 */
export const FREE_TIER_UNKNOWN_PRICE: TokenPrice = {
  model: "free tier / unknown",
  inputUsdPerMillion: 0,
  cachedInputUsdPerMillion: 0,
  outputUsdPerMillion: 0,
  inputMicroUsdPerMillion: 0,
  cachedInputMicroUsdPerMillion: 0,
  outputMicroUsdPerMillion: 0,
  source: "n/a",
  checkedOn: "n/a",
  known: false,
};

const PRICE_BY_MODEL: Readonly<Record<string, TokenPrice>> = {
  "gpt-4o-mini": GPT_4O_MINI_PRICE,
};

/** Price row for a model id. Unknown models, including other providers, use the free-tier case. */
export function priceForModel(model: string): TokenPrice {
  const key = model.trim().toLowerCase();
  return PRICE_BY_MODEL[key] ?? FREE_TIER_UNKNOWN_PRICE;
}

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
export function estimateCostUsd(
  usage: CostUsage,
  price: Pick<
    TokenPrice,
    "inputMicroUsdPerMillion" | "cachedInputMicroUsdPerMillion" | "outputMicroUsdPerMillion"
  > = GPT_4O_MINI_PRICE
): number {
  const prompt = tokenCount(usage.prompt_tokens);
  const completion = tokenCount(usage.completion_tokens);
  const cached = Math.min(tokenCount(usage.cached_tokens ?? 0), prompt);
  const uncached = prompt - cached;
  const micro =
    microFor(uncached, price.inputMicroUsdPerMillion) +
    microFor(cached, price.cachedInputMicroUsdPerMillion) +
    microFor(completion, price.outputMicroUsdPerMillion);
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

export class CallBudgetExceededError extends Error {
  readonly calls: number;
  readonly maxCalls: number;

  constructor(calls: number, maxCalls: number) {
    super(`Model calls ${calls} reached the --max-calls limit of ${maxCalls}.`);
    this.name = "CallBudgetExceededError";
    this.calls = calls;
    this.maxCalls = maxCalls;
  }
}
