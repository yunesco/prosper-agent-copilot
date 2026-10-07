import { stepTitle } from './graph';
import { candidateDiff, type GraphReference, type Proposal } from './proposals';
import type { SavedAgent } from './repository';

type Change = ReturnType<typeof candidateDiff>[number];
export type ProposalReviewRow = {
  id: string;
  title: string;
  summary: string;
  kind: 'instructions' | 'guidelines' | 'settings' | 'step';
  reference?: GraphReference;
  removed?: boolean;
  changes: Change[];
};

const fieldLabels: Record<string, string> = {
  name: 'Agent name',
  persona: 'Agent instructions',
  guidelines: 'Client guidelines',
  initial_node: 'Start step',
  voice_id: 'Voice',
  model: 'Model',
  task_messages: 'Instructions',
  role_message: 'Role instructions',
  pre_actions: 'Before-step actions',
  post_actions: 'After-step actions',
  end: 'End conversation',
  role: 'Message role',
  content: 'Message',
  edges: 'Transitions',
  function: 'Name',
  description: 'Condition',
  target: 'Next step',
  properties: 'Information to collect',
  required: 'Required information',
};

/** Readable native values, preserving line breaks and all payload fields without JSON syntax. */
export function proposalReviewText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    return value
      .map((item, index) => `${value.length > 1 ? `${index + 1}. ` : ''}${proposalReviewText(item)}`)
      .join('\n\n');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return 'None';
    return entries
      .map(([key, item]) => {
        const label = fieldLabels[key] ?? stepTitle(key);
        const text = proposalReviewText(item) || 'Not set';
        return `${label}:${(item !== null && typeof item === 'object') || text.includes('\n') ? '\n' : ' '}${text}`;
      })
      .join('\n\n');
  }
  return String(value);
}

const plainMessages = (value: unknown): value is { role: string; content: string }[] =>
  Array.isArray(value) &&
  value.every(
    item =>
      item !== null &&
      typeof item === 'object' &&
      typeof item.role === 'string' &&
      typeof item.content === 'string' &&
      Object.keys(item).every(key => key === 'role' || key === 'content'),
  );

/** Unchanged message wrappers add no review information; changed metadata stays visible. */
export function proposalReviewTexts(before: unknown, after: unknown) {
  if (
    plainMessages(before) &&
    plainMessages(after) &&
    before.length === after.length &&
    before.every((message, index) => message.role === after[index].role)
  )
    return {
      before: before.map(message => message.content).join('\n\n'),
      after: after.map(message => message.content).join('\n\n'),
    };
  return { before: proposalReviewText(before), after: proposalReviewText(after) };
}

function changeLabel(change: Change) {
  const ref = change.reference;
  if (!ref) return fieldLabels[change.label] ?? stepTitle(change.label);
  if (ref.kind === 'transition') return `Transition: ${stepTitle(ref.function)}`;
  if (change.label === ref.node) return 'Step configuration';
  const field = change.label.slice(ref.node.length + 1);
  return fieldLabels[field] ?? stepTitle(field);
}

function stepSummary(changes: Change[]) {
  const wholeStep = changes.find(change => change.label === change.reference?.node);
  if (wholeStep) return wholeStep.before === null ? 'Step added' : 'Step removed';
  const fields = new Set(
    changes
      .filter(change => change.reference?.kind === 'node')
      .map(change => change.label.slice(change.reference!.node.length + 1)),
  );
  const parts: string[] = [];
  if (fields.has('task_messages') || fields.has('role_message')) parts.push('Instructions updated');
  if (fields.has('pre_actions') || fields.has('post_actions')) parts.push('Actions updated');
  if (fields.has('end')) parts.push('End behavior updated');
  const transitions = changes.filter(change => change.reference?.kind === 'transition');
  for (const status of ['added', 'updated', 'removed'] as const) {
    const count = transitions.filter(change =>
      status === 'added'
        ? change.before === null
        : status === 'removed'
          ? change.after === null
          : change.before !== null && change.after !== null,
    ).length;
    if (count) parts.push(`${count} transition${count === 1 ? '' : 's'} ${status}`);
  }
  return parts.join(' · ');
}

/** Presentation only: group the complete candidate diff without changing the proposal. */
export function proposalReviewRows(base: SavedAgent, proposal: Proposal): ProposalReviewRow[] {
  const changes = candidateDiff(base.agent, proposal.candidate, {
    before: base.guidelines,
    after: proposal.guidelines,
  });
  const rows: ProposalReviewRow[] = [];
  for (const [field, kind, title] of [
    ['persona', 'instructions', 'Agent instructions'],
    ['guidelines', 'guidelines', 'Client guidelines'],
  ] as const) {
    const items = changes.filter(change => !change.reference && change.label === field);
    if (items.length) rows.push({ id: field, kind, title, summary: 'Updated', changes: items });
  }
  const settings = changes.filter(
    change => !change.reference && change.label !== 'persona' && change.label !== 'guidelines',
  );
  if (settings.length)
    rows.push({
      id: 'settings',
      kind: 'settings',
      title: 'Agent settings',
      summary: settings.map(change => changeLabel(change)).join(' · '),
      changes: settings,
    });
  const nodes = new Map<string, Change[]>();
  for (const change of changes) {
    if (!change.reference) continue;
    const name = change.reference.node;
    const items = nodes.get(name) ?? [];
    items.push(change);
    nodes.set(name, items);
  }
  for (const [name, items] of nodes)
    rows.push({
      id: `node:${name}`,
      kind: 'step',
      title: stepTitle(name),
      summary: stepSummary(items),
      reference: { kind: 'node', node: name },
      removed: !proposal.candidate.nodes.some(node => node.name === name),
      changes: items,
    });
  return rows.map(row => ({
    ...row,
    changes: row.changes.map(change => ({ ...change, label: changeLabel(change) })),
  }));
}
