import { z } from "zod";

export const InsightSchema = z.object({
  traceId: z.string(),
  appName: z.string().optional(),
  headerOp: z.string().optional(),

  summary: z.string().min(1),
  severity: z.enum(["info", "warn", "error"]),

  rootCause: z.string().optional(),
  suggestions: z.array(z.string()).max(8).optional(),

  signals: z
    .array(
      z.object({
        kind: z.enum(["error", "slow", "status", "db", "pattern"]),
        message: z.string().min(1)
      })
    )
    .max(12)
    .optional(),

  source: z.enum(["ai", "heuristic"]).optional()
});

export type InsightSchemaType = z.infer<typeof InsightSchema>;
