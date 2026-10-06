'use client';

import { useRef, useState } from 'react';
import { useTestCall } from './use-test-call';
import { TestCallControls, CallTranscript } from './TestCall';
import { applyAgentOperations, type AgentOperation } from '@/lib/agent/operations';
import { validateAgent } from '@/lib/runtime/validation';
import { stepTitle } from '@/lib/agent/graph';
import { loadAgentFixture } from '@/lib/fixtures';
import { useNodeEdits } from './use-node-edits';
import { createStepOperations } from '@/lib/agent/authoring';
import { AgentGraph } from './AgentGraph';
import { AgentInspector } from './AgentInspector';
import { GitBranch, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';

export function BuilderShell() {
  const [agent, setAgent] = useState(() => loadAgentFixture('original-scheduler'));
  const [mode, setMode] = useState<'builder' | 'call'>('builder');
  const audioRef = useRef<HTMLAudioElement>(null);
  const call = useTestCall(agent, audioRef);
  const currentAgent = useRef(agent);
  const revision = useRef(0);
  const save = async (operations: AgentOperation[]) => {
    const base = currentAgent.current;
    const baseRevision = revision.current;
    const candidate = applyAgentOperations(base, operations);
    await validateAgent(candidate);
    if (revision.current !== baseRevision) throw new Error('The agent changed during validation. Review and save again.');
    currentAgent.current = candidate;
    revision.current += 1;
    setAgent(candidate);
  };
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionFunction, setSelectedTransitionFunction] = useState<string | null>(null);
  const editor = useNodeEdits(agent, selectedNodeId, save);
  const selectNode = (id: string | null) => { setSelectedNodeId(id); setSelectedTransitionFunction(null); };
  const selectTransition = (source: string, index: number) => { setSelectedNodeId(source); setSelectedTransitionFunction(editor.agent.nodes.find(node => node.name === source)?.edges[index]?.function ?? null); };
  const addStep = (name: string, source: string | null, end: boolean, condition: string, goal: string) => {
    const { nodeId, operations } = createStepOperations(editor.agent, name, source, end, condition, goal);
    editor.operate(operations);
    selectNode(nodeId);
  };
  const deleteStep = (name: string) => {
    const incoming: AgentOperation[] = editor.agent.nodes.flatMap(node => node.edges.filter(edge => edge.target === name && node.name !== name).map(edge => ({ type: 'delete_edge' as const, node: node.name, function: edge.function })));
    editor.operate([...incoming, { type: 'delete_node', node: name }]);
    selectNode(null);
  };
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
            <Button variant="ghost" size="sm" aria-current={mode === 'builder' ? 'page' : undefined} onClick={() => { if (mode === 'call' && call.active) call.stop(); setMode('builder'); }} className="rounded-full aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text"><GitBranch aria-hidden="true" />Builder</Button>
            <Button variant="ghost" size="sm" className="rounded-full aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text" aria-current={mode === 'call' ? 'page' : undefined} onClick={() => setMode('call')}><Phone aria-hidden="true" />Test Call</Button>
          </nav>

        </div>
    </header>
    <audio ref={audioRef} autoPlay />
    <PaneWorkspace
      workspaceTitle={mode === 'call' ? 'Test Call' : 'Workflow'}
      workspaceLabel={mode === 'call' ? 'Call' : 'Graph'}
      contextTitle={<h2 className="flex items-center gap-2"><MessageCircle className="size-4 text-text-muted" />{mode === 'call' ? 'Call transcript' : selectedTransitionFunction !== null ? 'Transition' : selectedNodeId ? stepTitle(selectedNodeId) : 'Agent details'}</h2>}
      workspace={openContext => <><div className={mode === 'builder' ? 'h-full' : 'hidden'}><AgentGraph agent={editor.agent} pending={editor.pending} onAddStep={(name, source, end, condition, goal) => { addStep(name, source, end, condition, goal); openContext(); }} onDeleteStep={name => { deleteStep(name); openContext(); }} selectedNodeId={selectedNodeId} onSelect={id => { selectNode(id); if (id !== null) openContext(); }} onSelectTransition={(source, index) => { selectTransition(source, index); openContext(); }} /></div>{mode === 'call' && <TestCallControls call={call} />}</>}
      context={<><div className={mode === 'builder' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><AgentInspector editor={editor} onSave={save} agent={agent} selectedNodeId={selectedNodeId} onSelect={selectNode} selectedTransitionFunction={selectedTransitionFunction} onRenameTransition={setSelectedTransitionFunction} /></div>{mode === 'call' && <CallTranscript call={call} />}</>}
    />
  </main>;
}
