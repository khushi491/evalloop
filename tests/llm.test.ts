import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, chatCompletionJSON } from "../src/lib/llm";
import { EvaluatorOutputSchema } from "../src/lib/schemas";
import { validEvaluator } from "./fixtures";

const originalKey = process.env.OPENAI_API_KEY;
const originalBaseUrl = process.env.OPENAI_BASE_URL;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<unknown> | unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = originalBaseUrl;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chatCompletion", () => {
  it("throws before making a request when the API key is missing or still the placeholder", async () => {
    const fetchMock = mockFetch(() => {
      throw new Error("fetch should not be called");
    });

    delete process.env.OPENAI_API_KEY;
    await expect(
      chatCompletion([{ role: "user", content: "Hello" }])
    ).rejects.toThrow(/OPENAI_API_KEY/);

    process.env.OPENAI_API_KEY = "sk-placeholder";
    await expect(
      chatCompletion([{ role: "user", content: "Hello" }])
    ).rejects.toThrow(/OPENAI_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the configured base URL and strips a trailing slash", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1/";
    const fetchMock = mockFetch(async (url, init) => {
      expect(url).toBe("https://example.test/v1/chat/completions");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-not-a-real-key");
      return jsonResponse({
        choices: [{ message: { content: "done" } }],
      });
    });

    await expect(
      chatCompletion([{ role: "user", content: "Hello" }], { temperature: 0.4 })
    ).resolves.toEqual({ content: "done", usage: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redacts secret-shaped tokens in API error bodies", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    const leaked = "sk-abcdefghijklmnopqrstuvwxyz123456";
    mockFetch(() => jsonResponse(`unauthorized ${leaked}`, 401));

    try {
      await chatCompletion([{ role: "user", content: "Hello" }]);
      expect.fail("expected the API error to be thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("sk-***REDACTED***");
      expect(message).not.toContain(leaked);
    }
  });

  it("throws when the completion has no message content", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    mockFetch(() => jsonResponse({ choices: [] }));

    await expect(
      chatCompletion([{ role: "user", content: "Hello" }])
    ).rejects.toThrow(/empty response/);
  });
});

describe("chatCompletionJSON", () => {
  it("parses raw JSON, fenced JSON, and JSON wrapped in prose", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    const payloads = [
      '{"score":1}',
      '```json\n{"score":2}\n```',
      'Here you go:\n{"score":3}\nThanks!',
      'Ignore {"score":0}\n```json\n{"score":4}\n```',
    ];
    let call = 0;
    mockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: payloads[call++] } }],
      })
    );

    await expect(chatCompletionJSON([])).resolves.toEqual({ score: 1 });
    await expect(chatCompletionJSON([])).resolves.toEqual({ score: 2 });
    await expect(chatCompletionJSON([])).resolves.toEqual({ score: 3 });
    await expect(chatCompletionJSON([])).resolves.toEqual({ score: 4 });
  });

  it("retries once after malformed JSON and then returns the parsed object", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    const contents = ["not json at all", '{"ok":true}'];
    let call = 0;
    const fetchMock = mockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: contents[call++] } }],
      })
    );

    await expect(chatCompletionJSON([])).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after two malformed responses", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    const fetchMock = mockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: "```json\n{bad\n```" } }],
      })
    );

    await expect(chatCompletionJSON([])).rejects.toThrow(/invalid JSON after 2 attempts/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates parsed evaluator JSON and rejects a malformed object", async () => {
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    const contents = [
      "```json\n" + JSON.stringify(validEvaluator) + "\n```",
      '{"score_total":10,"notes":"missing rubric"}',
    ];
    let call = 0;
    mockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: contents[call++] } }],
      })
    );

    const parsed = EvaluatorOutputSchema.parse(await chatCompletionJSON([]));
    expect(parsed.score_total).toBe(52);
    expect(parsed.violations).toHaveLength(1);

    const malformed = await chatCompletionJSON([]);
    expect(EvaluatorOutputSchema.safeParse(malformed).success).toBe(false);
  });
});
