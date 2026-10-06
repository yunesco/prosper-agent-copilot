'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTestCall } from './use-test-call';
import { TestCallControls, CallTranscript } from './TestCall';
import { type AgentOperation } from '@/lib/agent/operations';
import { LocalAgentRepository, commitAgent, type AgentDocument, type SavedAgent } from '@/lib/agent/repository';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { XYPosition } from '@xyflow/react';
import { stepTitle } from '@/lib/agent/graph';
import { useNodeEdits } from './use-node-edits';
import { connectStepOperations, createStepOperations } from '@/lib/agent/authoring';
import { AgentGraph } from './AgentGraph';
import { AgentInspector } from './AgentInspector';
import { GitBranch, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';

export function BuilderShell() {
  const [repository] = useState(() => new LocalAgentRepository());
  const [document, setDocument] = useState<AgentDocument | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [geometry, setGeometry] = useState<Record<string, Record<string, XYPosition>>>(() => ({}));
  const saveGeometry = useCallback((id: string, positions: Record<string, XYPosition>) => { setGeometry(current => current[id] === positions ? current : { ...current, [id]: positions }); }, []);
  useEffect(() => {
    let active = true;
    void repository.initialize().then(doc => { if (active) { setDocument(doc); setError(''); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Could not open saved agents.'); });
    return () => { active = false; };
  }, [repository, attempt]);
  if (!document) return <main className="p-6"><h1 className="text-lg font-semibold">Agent builder</h1>{error ? <><p role="alert" className="my-4">{error}</p><Button onClick={() => setAttempt(value => value + 1)}>Retry storage</Button></> : <p role="status">Loading saved agents…</p>}</main>;
  const selected = document.agents.find(record => record.id === document.selectedId)!;
  return <AgentWorkspace key={selected.id} initial={selected} repository={repository} records={document.agents} geometry={geometry} saveGeometry={saveGeometry}
    onSwitch={id => {
      const record = repository.selectAgent(id);
      setDocument(current => current && ({ ...current, selectedId: id, agents: current.agents.map(item => item.id === id ? record : item) }));
    }}
    onSaved={record => setDocument(current => current && ({ ...current, agents: current.agents.map(item => item.id === record.id ? record : item) }))} />;
}

function AgentWorkspace({ initial, repository, records, onSwitch, onSaved, geometry, saveGeometry }: {
  initial: SavedAgent; repository: LocalAgentRepository; records: SavedAgent[];
  onSwitch: (id: string) => void; onSaved: (record: SavedAgent) => void;
  geometry: Record<string, Record<string, XYPosition>>; saveGeometry: (id: string, positions: Record<string, XYPosition>) => void;
}) {
  const onPositionsChange = useCallback((positions: Record<string, XYPosition>) => saveGeometry(initial.id, positions), [initial.id, saveGeometry]);
  const [record, setRecord] = useState(initial);
  const agent = record.agent;
  const [mode, setMode] = useState<'builder' | 'call'>('builder');
  const switchIntent = useRef(0);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState('');
  const agentTrigger = useRef<HTMLButtonElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const call = useTestCall(record, audioRef);
  const current = useRef(record);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const save = async (operations: AgentOperation[], guidelines = record.guidelines, assertDraft = () => {}) => {
    const base = current.current;
    const saved = await commitAgent(repository, base, operations, guidelines, () => {
      assertDraft();
      if (!active.current || current.current !== base) throw new Error('The active saved agent changed during validation. Review and save again.');
    });
    current.current = saved;
    setRecord(saved); onSaved(saved);
  };
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionFunction, setSelectedTransitionFunction] = useState<string | null>(null);
  const editor = useNodeEdits(agent, selectedNodeId, save, record);
  const switchAgent = (id: string) => {
    try {
      onSwitch(id);
      active.current = false; editor.cancel(); call.stop();
    } catch (error) { setSwitchError(error instanceof Error ? error.message : 'Could not switch agents.'); }
  };
  const selectNode = (id: string | null) => { setSelectedNodeId(id); setSelectedTransitionFunction(null); };
  const selectTransition = (source: string, index: number) => { setSelectedNodeId(source); setSelectedTransitionFunction(editor.agent.nodes.find(node => node.name === source)?.edges[index]?.function ?? null); };
  const addStep = (name: string, source: string | null, end: boolean, condition: string, goal: string) => {
    const { nodeId, operations } = createStepOperations(editor.agent, name, source, end, condition, goal);
    editor.operate(operations);
    selectNode(nodeId);
    return nodeId;
  };
  const deleteStep = (name: string) => {
    const incoming: AgentOperation[] = editor.agent.nodes.flatMap(node => node.edges.filter(edge => edge.target === name && node.name !== name).map(edge => ({ type: 'delete_edge' as const, node: node.name, function: edge.function })));
    editor.operate([...incoming, { type: 'delete_node', node: name }]);
    selectNode(null);
  };
  return <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-chrome pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
    <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-ui-border bg-surface-raised px-4 py-3 sm:grid-cols-[minmax(0,1fr)_18rem_auto] md:px-6">
      <h1 className="min-w-0 truncate text-sm font-medium">{agent.name}</h1>
      <Select value={record.id} onValueChange={value => { if (!value) return; setSwitchError(''); if (value === record.id) return; if (editor.dirty || editor.pending) { switchIntent.current += 1; setSwitchTarget(value); } else switchAgent(value); }}>
        <SelectTrigger ref={agentTrigger} aria-label="Saved agent" className="order-3 col-span-2 w-full sm:order-none sm:col-span-1"><SelectValue>{record.id === 'clinic-scheduler' ? 'Mocked existing deployed agent' : 'New / generated agent'}</SelectValue></SelectTrigger>
        <SelectContent>{records.map(item => <SelectItem key={item.id} value={item.id}>{item.id === 'clinic-scheduler' ? 'Mocked existing deployed agent' : 'New / generated agent'}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex shrink-0 items-center justify-end gap-3">
          <nav aria-label="Agent mode" className="inline-flex items-center gap-1 rounded-full border border-ui-border bg-surface-raised p-1">
            <Button variant="ghost" size="sm" aria-current={mode === 'builder' ? 'page' : undefined} onClick={() => { if (mode === 'call' && call.active) call.stop(); setMode('builder'); }} className="rounded-full aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text"><GitBranch aria-hidden="true" />Builder</Button>
            <Button variant="ghost" size="sm" className="rounded-full aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text" aria-current={mode === 'call' ? 'page' : undefined} onClick={() => setMode('call')}><Phone aria-hidden="true" />Test Call</Button>
          </nav>

        </div>
    </header>
    {switchError && <p role="alert" className="px-5 py-2 text-sm text-destructive">{switchError}</p>}
    <Dialog open={switchTarget !== null} onOpenChange={open => { if (!open) { switchIntent.current += 1; setSwitchTarget(null); } }}>
      <DialogContent initialFocus={keepEditing} finalFocus={agentTrigger} showCloseButton={false}>
        <DialogHeader><DialogTitle>Unsaved agent changes</DialogTitle><DialogDescription>Save your changes before switching agents?</DialogDescription></DialogHeader>
        {editor.error && <p role="alert" className="text-sm text-destructive">{editor.error}</p>}
        <div className="flex flex-col gap-2">
          <Button disabled={editor.pending || editor.unfinishedField || editor.invalidCollection} onClick={async () => { const intent = switchIntent.current; if (switchTarget && await editor.save() && intent === switchIntent.current) switchAgent(switchTarget); }}>{editor.pending ? 'Saving…' : 'Save and switch'}</Button>
          <Button variant="outline" onClick={() => { if (switchTarget) switchAgent(switchTarget); }}>Cancel edits and switch</Button>
          <Button ref={keepEditing} variant="ghost" onClick={() => { switchIntent.current += 1; setSwitchTarget(null); }}>Keep editing</Button>
        </div>
      </DialogContent>
    </Dialog>
    <audio ref={audioRef} autoPlay />
    <PaneWorkspace
      workspaceTitle={null}
      workspaceLabel={mode === 'call' ? 'Call' : 'Graph'}
      contextTitle={<h2>{mode === 'call' ? 'Call transcript' : selectedTransitionFunction !== null ? 'Transition' : selectedNodeId ? stepTitle(selectedNodeId) : 'Agent details'}</h2>}
      workspace={openContext => <><div className={mode === 'builder' ? 'h-full' : 'hidden'}><AgentGraph initialPositions={geometry[record.id]} onPositionsChange={onPositionsChange} selectedTransitionFunction={selectedTransitionFunction} agent={editor.agent} pending={editor.pending}
        onConnectSteps={(source, target) => {
          const operations = connectStepOperations(editor.agent, source, target);
          editor.operate(operations);
          setSelectedNodeId(source);
          const added = operations[0];
          if (added.type === 'add_edge') setSelectedTransitionFunction(added.value.function);
          openContext();
        }}
        onReconnectStep={(source, name, nextSource, target) => { if (editor.reconnect(source, name, nextSource, target)) { setSelectedNodeId(nextSource); setSelectedTransitionFunction(name); } openContext(); }}
        onAddStep={(name, source, end, condition, goal) => { const id = addStep(name, source, end, condition, goal); openContext(); return id; }} onDeleteStep={name => { deleteStep(name); openContext(); }} selectedNodeId={selectedNodeId} onSelect={id => { selectNode(id); if (id !== null) openContext(); }} onSelectTransition={(source, index) => { selectTransition(source, index); openContext(); }} /></div>{mode === 'call' && <TestCallControls call={call} saved={record} dirty={editor.dirty} />}</>}
      context={<><div className={mode === 'builder' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><AgentInspector editor={editor} onSave={save} agent={agent} selectedNodeId={selectedNodeId} onSelect={selectNode} selectedTransitionFunction={selectedTransitionFunction} onRenameTransition={setSelectedTransitionFunction} /></div>{mode === 'call' && <CallTranscript call={call} />}</>}
    />
  </main>;
}
