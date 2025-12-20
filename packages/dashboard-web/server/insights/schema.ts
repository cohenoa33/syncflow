import { z } from "zod";

export const InsightLLMSchema = z.object({
  traceId: z.string(),
  appName: z.string().nullable(),
  headerOp: z.string().nullable(),

  summary: z.string().min(1),
  severity: z.enum(["info", "warn", "error"]),

  rootCause: z.string().nullable(),
  suggestions: z.array(z.string()).max(8).nullable(),

  signals: z
    .array(
      z.object({
        kind: z.enum(["error", "slow", "status", "db", "pattern"]),
        message: z.string().min(1)
      })
    )
    .max(12)
    .nullable(),

  source: z.enum(["ai", "heuristic"]).nullable()
});

export type InsightLLM = z.infer<typeof InsightLLMSchema>;
