/**
 * Provider-agnostic OpenAI-compatible LLM client.
 * Works with OpenAI, Anthropic (via proxy), Azure, local models, etc.
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
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
    usage: data.usage,
  };
}

/**
 * Call LLM and parse the response as JSON. Retries once on parse failure.
 */
function extractJSON(text: string): string {
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

export async function chatCompletionJSON<T>(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await chatCompletion(messages, options);
    try {
      const cleaned = extractJSON(resp.content);
      return JSON.parse(cleaned) as T;
    } catch (parseErr) {
      console.error(
        `[llm] JSON parse attempt ${attempt + 1} failed:`,
        parseErr instanceof Error ? parseErr.message : parseErr,
        "Raw (first 300 chars):",
        resp.content.slice(0, 300)
      );
      if (attempt === 1) {
        throw new Error(
          `LLM returned invalid JSON after 2 attempts. Raw: ${resp.content.slice(0, 500)}`
        );
      }
    }
  }
  throw new Error("Unreachable");
}
