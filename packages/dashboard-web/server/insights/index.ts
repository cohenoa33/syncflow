import type { Insight, TraceEvent } from "./types";
import { buildHeuristicInsightForTrace } from "./heuristic";
import { buildAIInsightForTrace } from "./ai";

export type { Insight, TraceEvent };

export async function buildInsightForTrace(
  traceId: string,
  events: TraceEvent[],
  opts?: { allowFallback?: boolean }
): Promise<Insight> {
  const allowFallback = opts?.allowFallback ?? true;

  const ENABLE_AI = process.env.ENABLE_AI_INSIGHTS === "true";
  const canUseAI = ENABLE_AI && !!process.env.OPENAI_API_KEY;

  if (!canUseAI) {
    if (!allowFallback) {
      throw new Error("AI insights disabled or missing OPENAI_API_KEY");
    }
    return buildHeuristicInsightForTrace(traceId, events);
  }

  try {
    return await buildAIInsightForTrace(traceId, events);
  } catch (err) {
    console.error("[AI] Insight generation failed", err);

    if (!allowFallback) {
      // ✅ bubble up so route returns error to UI
      throw err;
    }

    console.warn("[AI] Falling back to heuristic insight");
    return buildHeuristicInsightForTrace(traceId, events);
  }
}
