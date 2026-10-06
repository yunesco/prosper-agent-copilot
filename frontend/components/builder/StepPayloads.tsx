import { type AgentEdge, type AgentNode } from '@/lib/agent/schema';
import { stepTitle } from '@/lib/agent/graph';

export function Payload({ value }: { value: unknown }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-lg bg-surface p-3 text-xs leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function CollectedFields({ edge }: { edge: AgentEdge }) {
  if (Object.keys(edge.properties).length === 0) return null;
  return (
    <section className="space-y-3">
      <h3 className="font-medium">Collected fields</h3>
      {Object.entries(edge.properties).map(([name, value]) => {
        const schema = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
        return (
          <div key={name} className="space-y-1 border-b border-ui-border pb-3 last:border-0">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{name}</span>
              <span className="shrink-0 text-xs text-text-subtle">
                {edge.required.includes(name) ? 'Required' : 'Optional'}
              </span>
            </div>
            {schema && typeof schema.type === 'string' && (
              <p className="text-xs text-text-subtle">{schema.type}</p>
            )}
            {schema && typeof schema.description === 'string' && (
              <p className="text-xs leading-5 text-text-muted">{schema.description}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function Actions({ node }: { node: AgentNode }) {
  if (!node.pre_actions.length && !node.post_actions.length) return null;
  return (
    <section className="space-y-4 border-t border-ui-border pt-5" aria-label="Step behavior">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Step behavior</h3>
        <span className="text-xs text-text-subtle">Read only</span>
      </div>
      {(['pre_actions', 'post_actions'] as const)
        .filter(kind => node[kind].length)
        .map(kind => (
          <div key={kind} className="space-y-2">
            <h4 className="text-xs text-text-muted">
              {kind === 'pre_actions' ? 'On entry' : 'On completion'}
            </h4>
            {node[kind].map((action, index) => (
              <div key={index} className="space-y-2">
                <p className="text-sm">
                  {typeof action.type === 'string' ? stepTitle(action.type) : 'Custom action'}
                </p>
                {typeof action.text === 'string' && (
                  <p className="whitespace-pre-wrap break-words text-xs leading-5 text-text-muted">
                    {action.text}
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer rounded-md py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 text-xs text-text-subtle">
                    Action payload
                  </summary>
                  <Payload value={action} />
                </details>
              </div>
            ))}
            {kind === 'post_actions' && node.end && node.post_actions.length > 0 && (
              <p className="text-xs leading-5 text-text-muted">
                These actions replace the default end-conversation action.
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
