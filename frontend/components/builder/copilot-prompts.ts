import type { ProductionCall } from '@/lib/platform/schema';

export const REVIEW_BEHAVIOR_PROMPT =
  'Review the saved guidelines against the saved configuration. Show a few grounded findings and ask a focused clarification for ambiguity.';

export const REVIEW_CALLS_PROMPT =
  'Review the recent calls and tell me whether anything looks wrong. Compare each transcript with the saved guidelines, including calls that succeeded or were not reported. Cite evidence, and propose the smallest fix if you find a problem.';

export const investigateCallPrompt = (call: Pick<ProductionCall, 'id' | 'title'>) =>
  `Investigate call ${call.id} (${call.title}). Using the saved guidelines, saved configuration and the call transcript, explain what happened and which step is responsible. If the agent is at fault, propose the smallest fix.`;
