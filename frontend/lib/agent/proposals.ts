import { z } from 'zod';
import { agentSchema, type AgentConfig } from './schema';
import { agentOperationSchema, applyAgentOperations } from './operations';
import { structuralIssues } from './conversation-quality';
import { commitAgent, type AgentRepository, type SavedAgent } from './repository';

export const graphReferenceSchema = z.union([
  z.object({ kind: z.literal('node'), node: z.string() }).strict(),
  z.object({ kind: z.literal('transition'), node: z.string(), function: z.string() }).strict(),
]);
export type GraphReference = z.infer<typeof graphReferenceSchema>;
export function referenceExists(agent: AgentConfig, ref: GraphReference) {
  const node = agent.nodes.find(node => node.name === ref.node);
  return !!node && (ref.kind === 'node' || node.edges.some(edge => edge.function === ref.function));
}
export const reviewContentSchema = z
  .object({
    summary: z.string(),
    behaviors: z.array(
      z
        .object({
          behavior: z.string(),
          excerpt: z.string().min(1),
          references: z.array(graphReferenceSchema),
          finding: z.string(),
          status: z.enum(['aligned', 'potential_mismatch', 'ambiguous']),
          clarification: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
// Constrain model quotes to exact source passages, rather than asking it to
// reproduce punctuation from memory. This selects evidence; it infers no rules.
// OpenAI strict structured outputs reject `"`, `\` and line breaks inside enum literals, so the
// model-facing enum shows a plain-text form and the schema maps the choice back to the exact passage.
const MAX_REVIEW_PASSAGES = 250;
export function groundedReviewSchema(guidelines: string) {
  const passages = new Set(
    [
      guidelines.trim(),
      ...Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(guidelines), item =>
        item.segment.trim(),
      ),
    ].filter(Boolean),
  );
  if (!passages.size) throw new Error('Add and save guidelines before reviewing behavior.');
  const source = new Map<string, string>();
  // OpenAI strict mode caps enum size; stay below it so long guidelines degrade to fewer citable passages, never to a failed request.
  for (const passage of [...passages].slice(0, MAX_REVIEW_PASSAGES)) {
    const shown = passage.replace(/\s+/g, ' ').replaceAll('"', "'").replaceAll('\\', '/');
    if (!source.has(shown)) source.set(shown, passage);
  }
  return reviewContentSchema.extend({
    behaviors: z
      .array(
        reviewContentSchema.shape.behaviors.element.extend({
          excerpt: z.enum([...source.keys()]).transform(shown => source.get(shown)!),
        }),
      )
      .max(6),
  });
}
export const behaviorReviewSchema = reviewContentSchema.extend({
  agentId: z.string(),
  revision: z.number().int().positive(),
});
export type BehaviorReview = z.infer<typeof behaviorReviewSchema>;
/** The model's review did not match the saved context; distinct from a request or provider failure. */
export class GroundingError extends Error {}
export function groundReview(base: SavedAgent, input: unknown): BehaviorReview {
  const review = reviewContentSchema.parse(input);
  if (!base.guidelines.trim()) throw new Error('Add and save guidelines before reviewing behavior.');
  for (const item of review.behaviors) {
    if (!base.guidelines.includes(item.excerpt))
      throw new GroundingError('Review cited an excerpt absent from saved guidelines.');
    if (item.references.some(ref => !referenceExists(base.agent, ref)))
      throw new GroundingError('Review cited an unavailable graph element.');
  }
  return { ...review, agentId: base.id, revision: base.revision };
}
export const patchInputSchema = z
  .object({
    agentId: z.string(),
    baseRevision: z.number().int().positive(),
    outcome: z.string().min(1),
    explanation: z.string().min(1),
    behavior: z.string().min(1),
    guidelines: z.string().min(1).optional(),
    operations: z.array(agentOperationSchema).min(1).max(60),
  })
  .strict();
export const proposalSchema = patchInputSchema.extend({
  id: z.string(),
  candidate: agentSchema,
  validation: z.object({ valid: z.literal(true) }),
});
export type Proposal = z.infer<typeof proposalSchema>;
export const exact = (value: unknown): string =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
export function candidateDiff(
  before: AgentConfig,
  after: AgentConfig,
  guidelines?: { before: string; after?: string },
) {
  const changes: { label: string; before: unknown; after: unknown; reference?: GraphReference }[] = [];
  const add = (label: string, a: unknown, b: unknown, reference?: GraphReference) => {
    if (exact(a) !== exact(b)) changes.push({ label, before: a ?? null, after: b ?? null, reference });
  };
  if (guidelines?.after !== undefined) add('guidelines', guidelines.before, guidelines.after);
  for (const key of ['name', 'persona', 'initial_node', 'voice_id', 'model'] as const)
    add(key, before[key], after[key]);
  for (const name of new Set([...before.nodes, ...after.nodes].map(node => node.name))) {
    const a = before.nodes.find(node => node.name === name),
      b = after.nodes.find(node => node.name === name);
    if (!a || !b) {
      add(name, a, b, { kind: 'node', node: name });
      continue;
    }
    for (const key of ['task_messages', 'role_message', 'pre_actions', 'post_actions', 'end'] as const)
      add(`${name}.${key}`, a[key], b[key], { kind: 'node', node: name });
    for (const fn of new Set([...a.edges, ...b.edges].map(edge => edge.function)))
      add(
        `${name}.${fn}`,
        a.edges.find(edge => edge.function === fn),
        b.edges.find(edge => edge.function === fn),
        { kind: 'transition', node: name, function: fn },
      );
  }
  return changes;
}
export async function constructProposal(
  base: SavedAgent,
  raw: unknown,
  validate: (agent: AgentConfig) => Promise<void>,
): Promise<Proposal> {
  const input = patchInputSchema.parse(raw);
  if (input.agentId !== base.id || input.baseRevision !== base.revision)
    throw new Error('Stale proposal context. Read the current saved agent.');
  const candidate = applyAgentOperations(base.agent, input.operations);
  if (!candidateDiff(base.agent, candidate, { before: base.guidelines, after: input.guidelines }).length)
    throw new Error('Proposal makes no configuration changes.');
  // Only defects this proposal introduces block it; an existing agent's older problems must not trap every edit.
  const existing = new Set(structuralIssues(base.agent));
  const introduced = structuralIssues(candidate).filter(issue => !existing.has(issue));
  if (introduced.length)
    throw new Error(`Proposal would leave the agent unable to complete calls: ${introduced.join(' ')}`);
  await validate(candidate);
  return proposalSchema.parse({ ...input, candidate, id: crypto.randomUUID(), validation: { valid: true } });
}
export async function commitProposal(
  repository: AgentRepository,
  base: SavedAgent,
  raw: unknown,
  assertActive: () => void,
) {
  const proposal = proposalSchema.parse(raw);
  if (base.id !== proposal.agentId || base.revision !== proposal.baseRevision)
    throw new Error('Proposal is out of date. Request a fresh proposal.');
  if (exact(applyAgentOperations(base.agent, proposal.operations)) !== exact(proposal.candidate))
    throw new Error('Reviewed candidate does not match the operations. Request a fresh proposal.');
  return commitAgent(
    repository,
    base,
    proposal.operations,
    proposal.guidelines ?? base.guidelines,
    assertActive,
  );
}
