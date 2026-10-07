import type { AgentConfig, AgentNode } from './schema';

const collects = /\b(collect|ask|capture|obtain|record)\b/i;
const text = (node: AgentNode) => node.task_messages.map(message => String(message.content ?? '')).join(' ');

/**
 * Structural conversation-quality checks on a candidate graph. The runtime can only enforce what the
 * transition schema says (a tool call needs its required fields), so these catch graphs that let the
 * agent advance too early or ask again. Tone, short answers and corrections are prompt-contract
 * behavior; they are covered by the Copilot instruction tests and live calls, not here.
 */
export function conversationQualityIssues(agent: AgentConfig): string[] {
  const issues: string[] = [];
  const byName = new Map(agent.nodes.map(node => [node.name, node]));
  for (const node of agent.nodes) {
    if (!collects.test(text(node))) continue;
    for (const edge of node.edges)
      if (!edge.required.length)
        issues.push(
          `Step ${node.name}: transition ${edge.function} can fire without collecting anything although the step collects information.`,
        );
  }
  // A field required on a transition is known afterwards; requiring it again downstream re-asks the caller.
  const walk = (name: string, known: ReadonlyMap<string, string>, path: ReadonlySet<string>) => {
    const node = byName.get(name);
    if (!node || path.has(name)) return;
    for (const edge of node.edges) {
      const next = new Map(known);
      for (const field of edge.required) {
        const origin = known.get(field);
        if (origin)
          issues.push(
            `Step ${node.name}: ${edge.function} asks for ${field} again; it was collected in ${origin}.`,
          );
        else next.set(field, node.name);
      }
      walk(edge.target, next, new Set([...path, name]));
    }
  };
  walk(agent.initial_node, new Map(), new Set());
  return [...new Set(issues)];
}
