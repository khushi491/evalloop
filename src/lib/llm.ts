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

function redact(text: string): string {
  return text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***REDACTED***");
}

const MAX_TRANSIENT_RETRIES = 6;

function isTransientStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/** Delay before the next retry after a 429. Honors Retry-After when it is a delay in seconds. */
export function retryAfterMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 60_000);
    }
  }
  return Math.min(6_000 * 2 ** attempt, 60_000);
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  /** Sent only when it is an integer. Omitted entirely when unset. */
  seed?: number;
  /**
   * Ask for a JSON object. The field is sent only when
   * `OPENAI_JSON_MODE=response_format`. Otherwise the caller parses JSON
   * out of the text, which is what Ollama's OpenAI-compatible server accepts.
   */
  jsonObject?: boolean;
}

function wantsResponseFormat(options: ChatOptions | undefined): boolean {
  return options?.jsonObject === true && process.env.OPENAI_JSON_MODE === "response_format";
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<LLMResponse> {
  const cfg = getConfig();
  const sendFormat = wantsResponseFormat(options);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 2048,
  };
  if (options?.seed !== undefined && Number.isInteger(options.seed)) {
    body.seed = options.seed;
  }
  if (sendFormat) {
    body.response_format = { type: "json_object" };
  }

  let res: Response | undefined;
  let errText = "unknown error";
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) break;

    errText = await res.text().catch(() => "unknown error");
    if (
      sendFormat &&
      res.status === 400 &&
      /response_format|json_object|unknown field|unrecognized/i.test(errText)
    ) {
      delete body.response_format;
      console.warn("[llm] provider rejected response_format; retrying without it");
      res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) break;
      errText = await res.text().catch(() => "unknown error");
    }
    if (isTransientStatus(res.status) && attempt < MAX_TRANSIENT_RETRIES) {
      const delay = retryAfterMs(attempt, res.headers.get("Retry-After"));
      const reason = res.status === 429 ? "rate limited" : "unavailable";
      console.warn(
        `[llm] ${res.status} ${reason}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_TRANSIENT_RETRIES})`
      );
      await sleep(delay);
      continue;
    }
    throw new Error(`LLM API error (${res.status}): ${redact(errText)}`);
  }

  if (!res || !res.ok) {
    throw new Error(`LLM API error (${res?.status ?? "unknown"}): ${redact(errText)}`);
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
  options?: ChatOptions
): Promise<{ data: T; usage: TokenUsage; attempts: number }> {
  let usage = emptyUsage();
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await chatCompletion(messages, { ...options, jsonObject: true });
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
  options?: ChatOptions
): Promise<T> {
  const { data } = await chatCompletionJSONDetailed<T>(messages, options);
  return data;
}
