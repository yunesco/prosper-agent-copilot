import type { AgentConfig, AgentNode } from './schema';

// Asking an open question ("ask how you can help") routes; asking *for* a value collects it.
const collects = /\b(collect|capture|obtain|record|ask (for|the caller for|them for|whether))\b/i;
// "Do not ask for it again" forbids collecting; it is not a collection instruction.
const negatedCollect =
  /\b(do not|don't|never|no need to|without)\s+(re-?)?(collect|capture|obtain|record|ask)\b[^.]*\.?/gi;
const collectsData = (value: string) => collects.test(value.replace(negatedCollect, ' '));
// Step text that limits what the caller may pick; the transition schema must enforce it with an enum.
const restricts = /\b(offer only|must (choose|pick|select)|one of (the|these|those))\b/i;
// A clock time written into the graph goes stale; availability must come from a tool at call time.
const clockTime = /\b\d{1,2}(:\d{2})?\s?([ap]\.?m\.?)(?![a-z])/i;
const text = (node: AgentNode) => node.task_messages.map(message => String(message.content ?? '')).join(' ');

/**
 * Structural defects that are always real bugs, independent of wording: a step that traps the caller or a
 * path that can never end the call. Unlike the heuristics below, these block a proposal (see constructProposal).
 */
export function structuralIssues(agent: AgentConfig): string[] {
  const issues: string[] = [];
  const byName = new Map(agent.nodes.map(node => [node.name, node]));
  for (const node of agent.nodes)
    if (!node.end && !node.edges.length)
      issues.push(
        `Step ${node.name} has no transition and does not end the call; the caller would be stuck.`,
      );
  // Every reachable step must be able to finish the call, so no loop or branch can trap the caller.
  const finishes = new Set(agent.nodes.filter(node => node.end).map(node => node.name));
  for (let changed = true; changed;) {
    changed = false;
    for (const node of agent.nodes)
      if (!finishes.has(node.name) && node.edges.some(edge => finishes.has(edge.target))) {
        finishes.add(node.name);
        changed = true;
      }
  }
  const reachable = new Set<string>();
  const visit = (name: string) => {
    if (reachable.has(name)) return;
    reachable.add(name);
    byName.get(name)?.edges.forEach(edge => visit(edge.target));
  };
  visit(agent.initial_node);
  for (const name of reachable)
    if (!finishes.has(name) && byName.get(name)?.edges.length)
      issues.push(`Step ${name} cannot reach any step that ends the call.`);
  return issues;
}

/**
 * Structural conversation-quality checks on a candidate graph. The runtime can only enforce what the
 * transition schema says (a tool call needs its required fields), so these catch graphs that let the
 * agent advance too early or ask again. Tone, short answers and corrections are prompt-contract
 * behavior; they are covered by the Copilot instruction tests and live calls, not here.
 */
/**
 * A phone-call graph should be small: each extra step or transition is another choice the model can get
 * wrong. These limits come from how well-run agents are built (a few steps, two or three ways out of any
 * step), not from the runtime, so they warn and never block.
 */
export function sizeIssues(agent: AgentConfig): string[] {
  const issues: string[] = [];
  if (agent.nodes.length > 8)
    issues.push(
      `The graph has ${agent.nodes.length} steps; most calls need 3 to 6. Merge steps that do the same job.`,
    );
  for (const node of agent.nodes)
    if (node.edges.length > 3)
      issues.push(
        `Step ${node.name} has ${node.edges.length} transitions; keep at most 3 and fold side cases into its instructions or the persona.`,
      );
  return issues;
}

/** Clock times typed into instructions, the persona or an enum are quoted from memory instead of looked up. */
export function hardcodedTimeIssues(agent: AgentConfig): string[] {
  const issues: string[] = [];
  if (clockTime.test(agent.persona ?? ''))
    issues.push(
      'The persona quotes a clock time. Appointment times must come from check_availability, not from the prompt.',
    );
  for (const node of agent.nodes) {
    const enums = node.edges.flatMap(edge =>
      Object.values(edge.properties).flatMap(schema =>
        schema && typeof schema === 'object' && !Array.isArray(schema) && Array.isArray(schema.enum)
          ? schema.enum.map(String)
          : [],
      ),
    );
    if ([text(node), ...enums].some(value => clockTime.test(value)))
      issues.push(
        `Step ${node.name} quotes a clock time. Appointment times must come from check_availability at call time, or they go stale; keep only the rule (for example which days a patient type may book).`,
      );
  }
  return issues;
}

export function conversationQualityIssues(agent: AgentConfig): string[] {
  const issues: string[] = [...structuralIssues(agent), ...sizeIssues(agent), ...hardcodedTimeIssues(agent)];
  const byName = new Map(agent.nodes.map(node => [node.name, node]));
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return !!byName.get(from)?.edges.some(edge => reaches(edge.target, to, seen));
  };
  // Corrections that return to an earlier step, and exits to an end step beside a transition that does
  // collect, are escape routes the caller may take at any time; they legitimately collect nothing new.
  const isEscape = (node: AgentNode, edge: AgentNode['edges'][number]) =>
    reaches(edge.target, node.name) ||
    (!!byName.get(edge.target)?.end && node.edges.some(other => other.required.length > 0));
  for (const node of agent.nodes) {
    if (!collectsData(text(node))) continue;
    for (const edge of node.edges)
      if (!edge.required.length && !isEscape(node, edge))
        issues.push(
          `Step ${node.name}: transition ${edge.function} can fire without collecting anything although the step collects information.`,
        );
  }
  for (const node of agent.nodes) {
    if (!restricts.test(text(node))) continue;
    // A selection transition whose every required value is free text lets the model submit any option.
    for (const edge of node.edges) {
      const isFree = (field: string) => {
        const schema = edge.properties[field];
        return (
          !!schema &&
          typeof schema === 'object' &&
          !Array.isArray(schema) &&
          schema.type === 'string' &&
          !('enum' in schema)
        );
      };
      if (edge.required.length && edge.required.every(isFree))
        issues.push(
          `Step ${node.name}: ${edge.function} collects ${edge.required.join(', ')} as free text although the step restricts the allowed values; give it an enum of the exact options.`,
        );
    }
  }
  // A field required on a transition is known afterwards; requiring it again downstream re-asks the caller.
  const walk = (name: string, known: ReadonlyMap<string, string>, path: ReadonlySet<string>) => {
    const node = byName.get(name);
    if (!node || path.has(name)) return;
    for (const edge of node.edges) {
      const next = new Map(known);
      for (const field of reaches(edge.target, node.name) ? [] : edge.required) {
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
