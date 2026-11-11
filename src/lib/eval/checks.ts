import { z } from "zod";

const idSchema = z.string().trim().min(1);

const CheckSchema = z.discriminatedUnion("type", [
  z.object({
    id: idSchema,
    type: z.literal("max_words"),
    max: z.number().int().positive(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("min_words"),
    min: z.number().int().nonnegative(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("required_keywords"),
    keywords: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    id: idSchema,
    type: z.literal("forbidden_substrings"),
    substrings: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    id: idSchema,
    type: z.literal("required_headings"),
    headings: z.array(z.string().trim().min(1)).min(1),
  }),
  z.object({
    id: idSchema,
    type: z.literal("required_regex"),
    pattern: z.string().min(1),
    flags: z.string().optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("forbidden_regex"),
    pattern: z.string().min(1),
    flags: z.string().optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("json"),
    requiredKeys: z.array(z.string().trim().min(1)).optional(),
  }),
]);

export type HardCheck = z.infer<typeof CheckSchema>;
export const HardCheckSchema = CheckSchema;

export interface HardCheckResult {
  id: string;
  type: HardCheck["type"];
  pass: boolean;
  message: string;
}

export interface HardCheckReport {
  passed: number;
  total: number;
  passRate: number;
  results: HardCheckResult[];
}

/** Words are non-empty runs of characters separated by whitespace. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function extractJsonDocument(text: string): unknown {
  let trimmed = text.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) trimmed = fenced[1].trim();
  return JSON.parse(trimmed);
}

function headingNames(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match?.[1]) continue;
    names.push(match[1].trim().replace(/:$/, "").trim());
  }
  return names;
}

function compile(pattern: string, flags: string | undefined, where: string): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${where}: invalid regular expression /${pattern}/: ${detail}`);
  }
}

export function assertChecksCompile(checks: HardCheck[], where: string): void {
  const seen = new Set<string>();
  for (const check of checks) {
    if (seen.has(check.id)) {
      throw new Error(`${where}: duplicate check id "${check.id}"`);
    }
    seen.add(check.id);
    if (check.type === "required_regex" || check.type === "forbidden_regex") {
      compile(check.pattern, check.flags, `${where} check "${check.id}"`);
    }
  }
}

function result(
  check: HardCheck,
  pass: boolean,
  message: string
): HardCheckResult {
  return { id: check.id, type: check.type, pass, message };
}

function evaluate(check: HardCheck, text: string): HardCheckResult {
  switch (check.type) {
    case "max_words": {
      const words = countWords(text);
      const pass = words <= check.max;
      return result(
        check,
        pass,
        pass
          ? `${words} words, limit ${check.max}.`
          : `${words} words exceeds the limit of ${check.max}.`
      );
    }
    case "min_words": {
      const words = countWords(text);
      const pass = words >= check.min;
      return result(
        check,
        pass,
        pass
          ? `${words} words, minimum ${check.min}.`
          : `${words} words is below the minimum of ${check.min}.`
      );
    }
    case "required_keywords": {
      const haystack = text.toLowerCase();
      const missing = check.keywords.filter(
        (keyword) => !haystack.includes(keyword.toLowerCase())
      );
      const pass = missing.length === 0;
      return result(
        check,
        pass,
        pass
          ? "All required keywords are present."
          : `Missing keywords: ${missing.join(", ")}.`
      );
    }
    case "forbidden_substrings": {
      const haystack = text.toLowerCase();
      const found = check.substrings.filter((substring) =>
        haystack.includes(substring.toLowerCase())
      );
      const pass = found.length === 0;
      return result(
        check,
        pass,
        pass
          ? "No forbidden text is present."
          : `Forbidden text present: ${found.join(", ")}.`
      );
    }
    case "required_headings": {
      const found = headingNames(text).map((name) => name.toLowerCase());
      const missing = check.headings.filter(
        (heading) => !found.includes(heading.toLowerCase())
      );
      const pass = missing.length === 0;
      return result(
        check,
        pass,
        pass
          ? "All required headings are present."
          : `Missing headings: ${missing.join(", ")}.`
      );
    }
    case "required_regex": {
      const regex = compile(check.pattern, check.flags, check.id);
      const pass = regex.test(text);
      return result(
        check,
        pass,
        pass
          ? "Required pattern matched."
          : `Required pattern /${check.pattern}/ did not match.`
      );
    }
    case "forbidden_regex": {
      const regex = compile(check.pattern, check.flags, check.id);
      const pass = !regex.test(text);
      return result(
        check,
        pass,
        pass
          ? "Forbidden pattern is absent."
          : `Forbidden pattern /${check.pattern}/ matched.`
      );
    }
    case "json": {
      let parsed: unknown;
      try {
        parsed = extractJsonDocument(text);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return result(check, false, `Invalid JSON: ${detail}`);
      }
      if (!check.requiredKeys || check.requiredKeys.length === 0) {
        return result(check, true, "JSON parses.");
      }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return result(check, false, "JSON value must be an object with the required keys.");
      }
      const record = parsed as Record<string, unknown>;
      const missing = check.requiredKeys.filter((key) => !(key in record));
      const pass = missing.length === 0;
      return result(
        check,
        pass,
        pass
          ? "JSON has the required keys."
          : `Missing keys: ${missing.join(", ")}.`
      );
    }
    default: {
      const unreachable: never = check;
      return unreachable;
    }
  }
}

export function runHardChecks(text: string, checks: readonly HardCheck[]): HardCheckReport {
  const results = checks.map((check) => evaluate(check, text));
  const passed = results.filter((item) => item.pass).length;
  const total = results.length;
  return {
    passed,
    total,
    // Nothing failed when the task defines no checks. A 0 rate would drag a
    // blended total down as if every check had failed.
    passRate: total === 0 ? 1 : passed / total,
    results,
  };
}
