export interface ProviderConfig {
  /** Label stored on the run. `EVAL_PROVIDER` wins over the URL heuristic. */
  provider: string;
  model: string;
  /** Base URL with no trailing slash. */
  baseUrl: string;
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  const baseUrl = (env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.OPENAI_MODEL || "gpt-4o-mini";
  const named = env.EVAL_PROVIDER?.trim();
  if (named) return { provider: named, model, baseUrl };
  const host = baseUrl.toLowerCase();
  if (host.includes("generativelanguage.googleapis.com")) {
    return { provider: "gemini", model, baseUrl };
  }
  if (host.includes(":11434") || host.includes("localhost") || host.includes("127.0.0.1")) {
    return { provider: host.includes(":11434") ? "ollama" : "local", model, baseUrl };
  }
  if (host.includes("api.openai.com")) return { provider: "openai", model, baseUrl };
  return { provider: "custom", model, baseUrl };
}
