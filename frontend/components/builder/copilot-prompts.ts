import type { GraphReference } from '@/lib/agent/proposals';
import type { SavedAgent } from '@/lib/agent/repository';
import type { ProductionCall } from '@/lib/platform/schema';

export const REVIEW_BEHAVIOR_PROMPT =
  'Review the saved guidelines against the saved configuration. Show a few grounded findings and ask a focused clarification for ambiguity.';

export const REVIEW_CALLS_PROMPT =
  'Review the recent calls and tell me whether anything looks wrong. Compare each transcript with the saved guidelines, including calls that succeeded or were not reported. Cite evidence, and propose the smallest fix if you find a problem.';

export const investigateCallPrompt = (call: Pick<ProductionCall, 'id' | 'title'>) =>
  `Investigate call ${call.id} (${call.title}). Using the saved guidelines, saved configuration and the call transcript, explain what happened and which step is responsible. If the agent is at fault, propose the smallest fix.`;

export const STARTER_PROMPT =
  "I want to build a voice agent but I'm starting from nothing. Interview me for what you need, then build it.";

export type CopilotEmptyState = {
  title: string;
  body: string;
  suggestions: { label: string; prompt: string }[];
};

/** What the empty Copilot pane offers, derived from the saved agent and the selected graph element. */
export function copilotEmptyState(
  agent: Pick<SavedAgent['agent'], 'nodes'>,
  guidelines: string,
  selected: GraphReference | null,
): CopilotEmptyState {
  if (selected?.kind === 'node')
    return {
      title: 'Ask about this step',
      body: 'Copilot reads its saved instructions and transitions. Nothing changes until you review and apply it.',
      suggestions: [
        {
          label: 'Explain this step',
          prompt: `Explain what the step ${selected.node} does, how a call reaches it and where it can go next.`,
        },
        {
          label: 'Improve its instructions',
          prompt: `Review the instructions of the step ${selected.node} against the saved guidelines and propose the smallest improvement, if one is needed.`,
        },
      ],
    };
  if (selected)
    return {
      title: 'Ask about this transition',
      body: 'Copilot reads the saved condition and the steps it connects. Nothing changes until you review and apply it.',
      suggestions: [
        {
          label: 'Explain this transition',
          prompt: `Explain when the transition ${selected.function} from ${selected.node} is taken and whether its condition is clear.`,
        },
      ],
    };
  const scaffold = agent.nodes.length === 1 && !agent.nodes[0].edges.length;
  if (scaffold)
    return {
      title: 'What should your voice agent do?',
      body: 'Describe it in a sentence, or paste your guidelines. Copilot asks what it needs, then proposes a workflow for you to review.',
      suggestions: [{ label: 'Design an agent from scratch', prompt: STARTER_PROMPT }],
    };
  if (guidelines.trim())
    return {
      title: 'Ask about this agent',
      body: 'Copilot compares your saved guidelines with the workflow. Nothing changes until you review and apply it.',
      suggestions: [
        { label: 'Review behavior against guidelines', prompt: REVIEW_BEHAVIOR_PROMPT },
        {
          label: 'Find gaps in the workflow',
          prompt: 'Look for missing steps, unclear transitions or information the agent never collects.',
        },
      ],
    };
  return {
    title: 'Ask about this agent',
    body: 'This agent has no guidelines yet. Paste them or describe how it should behave, and Copilot proposes changes for you to review.',
    suggestions: [
      {
        label: 'Find gaps in the workflow',
        prompt: 'Look for missing steps, unclear transitions or information the agent never collects.',
      },
    ],
  };
}
