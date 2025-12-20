import { zodTextFormat } from "openai/helpers/zod";
import { InsightLLMSchema } from "./schema";
import { getOpenAI } from "./openaiClient";
import { summarizeEventsForLLM } from "./summarize";
import { getInsightSystemPrompt } from "./llmPrompt";
import type { Insight, TraceEvent } from "./types";
/* -----------------------------
        Helpers
----------------------------- */
function trimForLog(s: string, max = 800) {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (err: any) => boolean;
  }
): Promise<T> {
  const retries = opts?.retries ?? 2; // total attempts = 1 + retries
  const baseDelayMs = opts?.baseDelayMs ?? 300;
  const maxDelayMs = opts?.maxDelayMs ?? 2000;

  const shouldRetry =
    opts?.shouldRetry ??
    ((err: any) => {
      const status = err?.status ?? err?.statusCode;
      // retry on network-ish errors + 429/5xx
      return (
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /timed out/i.test(err?.message ?? "") ||
        /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(err?.code ?? "")
      );
    });

  let lastErr: any;

  for (let attempt = 1; attempt <= 1 + retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;

      if (attempt >= 1 + retries || !shouldRetry(err)) throw err;

      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt - 1)
      );
      await sleep(delay);
    }
  }

  throw lastErr;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  let t: NodeJS.Timeout | null = null;

  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function safeErrMeta(err: any) {
  return {
    name: err?.name,
    message: err?.message,
    status: err?.status ?? err?.statusCode,
    code: err?.code,
    type: err?.type,
    param: err?.param,
    request_id: err?.request_id,
    cause: err?.cause?.message
  };
}

/* -----------------------------
        Main Export
----------------------------- */

export async function buildAIInsightForTrace(
  traceId: string,
  events: TraceEvent[]
): Promise<Insight> {
  const INSIGHT_MODEL = process.env.INSIGHT_MODEL || "gpt-5.2";

  const openai = getOpenAI();
  const ordered = [...events].sort((a, b) => a.ts - b.ts);
  const expressEvt = ordered.find((e) => e.type === "express");
  const appName = expressEvt?.appName ?? ordered[0]?.appName;
  const headerOp = expressEvt?.operation ?? ordered[0]?.operation ?? "Trace";

  const traceSummary = summarizeEventsForLLM(ordered);
  const system = getInsightSystemPrompt();

  const user = { traceId, appName, headerOp, events: traceSummary };

  const start = Date.now();
  const timeoutMs = Number(process.env.INSIGHT_TIMEOUT_MS || 12_000);

  let resp;
  try {
    resp = await withRetries(
      async (attempt) =>
        withTimeout(
          openai.responses.parse({
            model: INSIGHT_MODEL,
            input: [
              { role: "system", content: system },
              { role: "user", content: JSON.stringify(user) }
            ],
            text: {
              format: zodTextFormat(InsightLLMSchema, "insight")
            }
          }),
          timeoutMs,
          `openai.responses.parse (attempt ${attempt})`
        ),
      { retries: Number(process.env.INSIGHT_RETRIES || 2) }
    );
  } catch (err) {
    console.error("[AI] OpenAI insight failed", {
      traceId,
      model: INSIGHT_MODEL,
      ms: Date.now() - start,
      ...safeErrMeta(err)
    });
    throw err;
  }

  // output_parsed is already validated to your schema by the SDK helper
  const parsed = resp.output_parsed;
  if (!parsed) throw new Error("Missing output_parsed from OpenAI response");

  // Convert nullable -> undefined to match your Insight type style (optional fields)
  const suggestions =
    parsed.suggestions === null ? undefined : parsed.suggestions;
  const signals = parsed.signals === null ? undefined : parsed.signals;
  const rootCause = parsed.rootCause === null ? undefined : parsed.rootCause;

  return {
    traceId, // lock server-truth
    appName, // lock server-truth
    headerOp, // lock server-truth
    summary: parsed.summary,
    severity: parsed.severity,
    rootCause,
    suggestions,
    signals,
    source: "ai"
  };
}