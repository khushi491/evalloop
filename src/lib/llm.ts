/**
 * Provider-agnostic OpenAI-compatible LLM client.
 * Works with OpenAI, Anthropic (via proxy), Azure, local models, etc.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Prompt tokens the API reported as cache hits. Omitted when the provider did not say. */
  cached_tokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: TokenUsage;
}

export class InvalidJsonError extends Error {
  readonly usage: TokenUsage;
  readonly attempts: number;

  constructor(message: string, usage: TokenUsage, attempts: number) {
    super(message);
    this.name = "InvalidJsonError";
    this.usage = usage;
    this.attempts = attempts;
  }
}

export function emptyUsage(): TokenUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 };
}

export function addUsage(left: TokenUsage, right: TokenUsage | undefined): TokenUsage {
  if (!right) return left;
  return {
    prompt_tokens: left.prompt_tokens + right.prompt_tokens,
    completion_tokens: left.completion_tokens + right.completion_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
    cached_tokens: (left.cached_tokens ?? 0) + (right.cached_tokens ?? 0),
  };
}

function readUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const usage = raw as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown };
  };
  if (typeof usage.prompt_tokens !== "number") return undefined;
  const prompt_tokens = usage.prompt_tokens;
  const completion_tokens =
    typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const total_tokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : prompt_tokens + completion_tokens;
  const cachedRaw = usage.prompt_tokens_details?.cached_tokens;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    cached_tokens: typeof cachedRaw === "number" ? cachedRaw : 0,
  };
}

function getConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === "sk-placeholder") {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env (see .env.example)."
    );
  }
  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

const SENSITIVE_PATTERN = /sk-[a-zA-Z0-9]{20,}/g;

function redact(text: string): string {
  return text.replace(SENSITIVE_PATTERN, "sk-***REDACTED***");
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<LLMResponse> {
  const cfg = getConfig();

  const body = {
    model: cfg.model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
  };

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(
      `LLM API error (${res.status}): ${redact(errText)}`
    );
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error("LLM returned empty response");
  }

  return {
    content: choice.message.content,
    usage: readUsage(data.usage),
  };
}

/**
 * Call LLM and parse the response as JSON. Retries once on parse failure.
 */
export function extractJSON(text: string): string {
  // Try to find JSON inside markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find a top-level JSON object
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }

  return text.trim();
}

export async function chatCompletionJSONDetailed<T>(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ data: T; usage: TokenUsage; attempts: number }> {
  let usage = emptyUsage();
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await chatCompletion(messages, options);
    usage = addUsage(usage, resp.usage);
    try {
      const cleaned = extractJSON(resp.content);
      return {
        data: JSON.parse(cleaned) as T,
        usage,
        attempts: attempt + 1,
      };
    } catch (parseErr) {
      console.error(
        `[llm] JSON parse attempt ${attempt + 1} failed:`,
        parseErr instanceof Error ? parseErr.message : parseErr,
        "Raw (first 300 chars):",
        resp.content.slice(0, 300)
      );
      if (attempt === 1) {
        throw new InvalidJsonError(
          `LLM returned invalid JSON after 2 attempts. Raw: ${resp.content.slice(0, 500)}`,
          usage,
          2
        );
      }
    }
  }
  throw new Error("Unreachable");
}

export async function chatCompletionJSON<T>(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  const { data } = await chatCompletionJSONDetailed<T>(messages, options);
  return data;
}
