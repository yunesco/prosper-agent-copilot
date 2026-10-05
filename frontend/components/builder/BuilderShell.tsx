'use client';

import { useRef, useState } from 'react';
import { applyAgentOperations, type AgentOperation } from '@/lib/agent/operations';
import { validateAgent } from '@/lib/runtime/validation';
import { stepTitle } from '@/lib/agent/graph';
import { loadAgentFixture } from '@/lib/fixtures';
import { AgentGraph } from './AgentGraph';
import { AgentInspector } from './AgentInspector';
import { GitBranch, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';

export function BuilderShell() {
  const [agent, setAgent] = useState(() => loadAgentFixture('original-scheduler'));
  const currentAgent = useRef(agent);
  const save = async (operations: AgentOperation[]) => {
    const base = currentAgent.current;
    const candidate = applyAgentOperations(base, operations);
    await validateAgent(candidate);
    if (currentAgent.current !== base) throw new Error('The agent changed during validation. Review and save again.');
    currentAgent.current = candidate;
    setAgent(candidate);
  };
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionIndex, setSelectedTransitionIndex] = useState<number | null>(null);
  const selectNode = (id: string | null) => { setSelectedNodeId(id); setSelectedTransitionIndex(null); };
  const selectTransition = (source: string, index: number) => { setSelectedNodeId(source); setSelectedTransitionIndex(index); };
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-chrome pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
    <header className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-3 border-b border-ui-border bg-surface-raised px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="text-base font-semibold tracking-tight">prosper<span className="text-accent-text">.</span></span>
        <span className="h-5 border-l border-ui-border" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-sm font-medium">Agent builder</h1>
          <p className="text-xs leading-5 text-text-subtle">{agent.name}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 md:ml-auto">
          <nav aria-label="Agent mode" className="inline-flex items-center gap-1 rounded-full border border-ui-border bg-surface-raised p-1">
            <Button variant="ghost" size="sm" aria-current="page" className="rounded-full bg-accent-soft text-accent-text"><GitBranch aria-hidden="true" />Builder</Button>
            <Button variant="ghost" size="sm" className="rounded-full" disabled aria-describedby="call-unavailable"><Phone aria-hidden="true" />Test Call</Button>
          </nav>
          <p id="call-unavailable" className="text-xs text-text-subtle">Unavailable</p>
        </div>
    </header>
    <PaneWorkspace
      workspaceTitle="Workflow"
      contextTitle={<h2 className="flex items-center gap-2"><MessageCircle className="size-4 text-text-muted" />{selectedTransitionIndex !== null ? 'Transition' : selectedNodeId ? stepTitle(selectedNodeId) : 'Agent details'}</h2>}
      workspace={openContext => <AgentGraph agent={agent} selectedNodeId={selectedNodeId} onSelect={id => { selectNode(id); if (id !== null) openContext(); }} onSelectTransition={(source, index) => { selectTransition(source, index); openContext(); }} />}
      context={<AgentInspector onSave={save} agent={agent} selectedNodeId={selectedNodeId} onSelect={selectNode} selectedTransitionIndex={selectedTransitionIndex} />}
    />
  </main>;
}
