import { z } from 'zod';

export const callSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  title: z.string(),
  duration_seconds: z.number().int().positive(),
  outcome: z.enum(['successful', 'failed']),
  graph_path: z.array(z.string()),
  transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })),
  client_feedback: z.string().optional(),
});
export type ProductionCall = z.infer<typeof callSchema>;

export const callSummarySchema = callSchema
  .pick({ id: true, agent_id: true, title: true, outcome: true, duration_seconds: true, graph_path: true })
  .extend({ turns: z.number().int().nonnegative(), reported: z.boolean() });
export type CallSummary = z.infer<typeof callSummarySchema>;
export const callPageSchema = z.object({
  calls: z.array(callSummarySchema),
  next_cursor: z.string().nullable(),
});
export type CallPage = z.infer<typeof callPageSchema>;
