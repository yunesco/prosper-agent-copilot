'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { XYPosition } from '@xyflow/react';
import { PaneWorkspace } from '@/components/panes/PaneWorkspace';
import { connectStepOperations, createStepOperations } from '@/lib/agent/authoring';
import { stepTitle } from '@/lib/agent/graph';
import type { AgentOperation } from '@/lib/agent/operations';
import { proposalGraphChanges } from '@/lib/agent/proposal-graph';
import { candidateDiff, commitProposal, type GraphReference, type Proposal } from '@/lib/agent/proposals';
import { commitAgent, type LocalAgentRepository, type SavedAgent } from '@/lib/agent/repository';
import { AgentBehavior } from './AgentBehavior';
import { AgentGraph } from './AgentGraph';
import { AgentInspector } from './AgentInspector';
import { ContextTabs, type ContextPane } from './ContextTabs';
import { CopilotPane } from './CopilotPane';
import { investigateCallPrompt, REVIEW_BEHAVIOR_PROMPT, REVIEW_CALLS_PROMPT } from './copilot-prompts';
import { ProposalInspector } from './ProposalInspector';
import { ProposalPreviewBanner } from './ProposalPreviewBanner';
import { CallDetails, RecentCalls } from './RecentCalls';
import { CallTranscript, TestCallControls } from './TestCall';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { useCallEvidence } from './use-call-evidence';
import { useCopilot } from './use-copilot';
import { useNodeEdits } from './use-node-edits';
import { useProposalPreview } from './use-proposal-preview';
import { useTestCall } from './use-test-call';
import { WorkspaceHeader } from './WorkspaceHeader';

type Geometry = Record<string, Record<string, XYPosition>>;

/**
 * One saved agent being edited: the saved record, the manual draft, Copilot, and Test Call.
 * Saves and Apply share one revision-guarded commit; Copilot and Test Call only ever see saved state.
 */
export function AgentWorkspace({
  initial,
  repository,
  records,
  onSwitch,
  onSaved,
  geometry,
  saveGeometry,
}: {
  initial: SavedAgent;
  repository: LocalAgentRepository;
  records: SavedAgent[];
  onSwitch: (id: string) => void;
  onSaved: (record: SavedAgent) => void;
  geometry: Geometry;
  saveGeometry: (id: string, positions: Record<string, XYPosition>) => void;
}) {
  const onPositionsChange = useCallback(
    (positions: Record<string, XYPosition>) => saveGeometry(initial.id, positions),
    [initial.id, saveGeometry],
  );
  const [record, setRecord] = useState(initial);
  const agent = record.agent;
  const [mode, setMode] = useState<'builder' | 'call'>('builder');
  const [pane, setPane] = useState<ContextPane>('details');
  const audioRef = useRef<HTMLAudioElement>(null);
  const call = useTestCall(record, audioRef);
  // `current` is the saved record commits are checked against; `active` is false once this agent is switched away.
  const current = useRef(record);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const commitSaved = (saved: SavedAgent) => {
    current.current = saved;
    setRecord(saved);
    onSaved(saved);
  };
  const save = async (
    operations: AgentOperation[],
    guidelines = record.guidelines,
    assertDraft = () => {},
  ) => {
    const base = current.current;
    commitSaved(
      await commitAgent(repository, base, operations, guidelines, () => {
        assertDraft();
        if (!active.current || current.current !== base)
          throw new Error('The active saved agent changed during validation. Review and save again.');
      }),
    );
  };

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionFunction, setSelectedTransitionFunction] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ node: string; token: number } | null>(null);
  const editor = useNodeEdits(agent, selectedNodeId, save, record);
  const selected: GraphReference | null = selectedNodeId
    ? selectedTransitionFunction
      ? { kind: 'transition', node: selectedNodeId, function: selectedTransitionFunction }
      : { kind: 'node', node: selectedNodeId }
    : null;
  const copilot = useCopilot(record, selected);
  const evidence = useCallEvidence(record.id, () => active.current);
  const readyProposals = copilot.proposals.filter(item => copilot.state(item) === 'Ready to apply');
  const availableProposal = readyProposals[0]?.proposal;
  const preview = useProposalPreview(availableProposal);

  const selectNode = (id: string | null) => {
    setSelectedNodeId(id);
    setSelectedTransitionFunction(null);
  };
  const selectTransition = (source: string, index: number) => {
    setSelectedNodeId(source);
    setSelectedTransitionFunction(
      editor.agent.nodes.find(node => node.name === source)?.edges[index]?.function ?? null,
    );
  };
  const focusReference = (ref: GraphReference) => {
    preview.hide();
    setFocusRequest(value => ({ node: ref.node, token: (value?.token ?? 0) + 1 }));
    setSelectedNodeId(ref.node);
    setSelectedTransitionFunction(ref.kind === 'transition' ? ref.function : null);
  };
  const addStep = (name: string, source: string | null, end: boolean, condition: string, goal: string) => {
    const { nodeId, operations } = createStepOperations(editor.agent, name, source, end, condition, goal);
    editor.operate(operations);
    selectNode(nodeId);
    return nodeId;
  };
  const deleteStep = (name: string) => {
    const incoming: AgentOperation[] = editor.agent.nodes.flatMap(node =>
      node.edges
        .filter(edge => edge.target === name && node.name !== name)
        .map(edge => ({ type: 'delete_edge' as const, node: node.name, function: edge.function })),
    );
    editor.operate([...incoming, { type: 'delete_node', node: name }]);
    selectNode(null);
  };

  // Apply saves exactly the reviewed candidate, and only if nothing it was based on has moved.
  const [applying, setApplying] = useState(false);
  const applyLock = useRef(false);
  const [applyError, setApplyError] = useState('');
  const [highlights, setHighlights] = useState<GraphReference[]>([]);
  const draftState = useRef({ dirty: editor.dirty, pending: editor.pending, generation: 0 });
  useLayoutEffect(() => {
    draftState.current = {
      dirty: editor.dirty,
      pending: editor.pending,
      generation: draftState.current.generation + 1,
    };
  }, [editor.agent, editor.guidelines, editor.dirty, editor.pending]);
  useEffect(() => {
    if (!highlights.length) return;
    const timer = setTimeout(() => setHighlights([]), 5000);
    return () => clearTimeout(timer);
  }, [highlights]);
  const changedReferences = (before: SavedAgent['agent'], after: SavedAgent['agent']) =>
    candidateDiff(before, after).flatMap(change => (change.reference ? [change.reference] : []));
  const apply = async (proposal: Proposal, base: SavedAgent) => {
    if (applyLock.current) return;
    applyLock.current = true;
    setApplying(true);
    setApplyError('');
    const draftGeneration = draftState.current.generation;
    const assertActive = () => {
      if (draftState.current.generation !== draftGeneration)
        throw new Error('Manual draft changed during validation. Review and apply again.');
      if (!active.current || current.current.id !== base.id || current.current.revision !== base.revision)
        throw new Error('Saved context changed. Request a fresh proposal.');
      if (draftState.current.dirty || draftState.current.pending)
        throw new Error('Save or cancel manual edits before applying.');
    };
    try {
      const saved = await commitProposal(repository, base, proposal, assertActive);
      commitSaved(saved);
      editor.cancel();
      copilot.close(proposal.id, 'Applied');
      setHighlights(changedReferences(base.agent, saved.agent));
    } catch (error) {
      if (active.current) setApplyError(error instanceof Error ? error.message : 'Apply failed. Try again.');
    } finally {
      applyLock.current = false;
      if (active.current) setApplying(false);
    }
  };
  const canvasHighlights = highlights.length
    ? highlights
    : readyProposals.flatMap(item => {
        const base = copilot.bases[item.proposal.baseRevision];
        return base ? changedReferences(base.agent, item.proposal.candidate) : [];
      });

  // Switching agents asks about an unsaved draft first, and invalidates everything in flight.
  const switchIntent = useRef(0);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState('');
  const agentTrigger = useRef<HTMLButtonElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const switchAgent = (id: string) => {
    try {
      onSwitch(id);
      active.current = false;
      editor.cancel();
      call.stop();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : 'Could not switch agents.');
    }
  };
  const selectAgent = (id: string) => {
    setSwitchError('');
    if (id === record.id) return;
    if (editor.dirty || editor.pending) {
      switchIntent.current += 1;
      setSwitchTarget(id);
    } else switchAgent(id);
  };
  const keepEditingAgent = () => {
    switchIntent.current += 1;
    setSwitchTarget(null);
  };

  const askCopilot = (text: string, intent?: 'review') => {
    setPane('copilot');
    copilot.send(text, intent);
  };
  const detailsTitle =
    selectedTransitionFunction !== null
      ? 'Transition'
      : selectedNodeId
        ? stepTitle(selectedNodeId)
        : 'Agent details';

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-app-chrome pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
      <WorkspaceHeader
        agentName={agent.name}
        records={records}
        currentId={record.id}
        mode={mode}
        triggerRef={agentTrigger}
        onSelectAgent={selectAgent}
        onMode={next => {
          if (next === 'builder' && mode === 'call' && call.active) call.stop();
          setMode(next);
        }}
      />
      {switchError && (
        <p role="alert" className="px-5 py-2 text-sm text-destructive">
          {switchError}
        </p>
      )}
      <UnsavedChangesDialog
        open={switchTarget !== null}
        error={editor.error}
        pending={editor.pending}
        canSave={!editor.unfinishedField && !editor.invalidCollection}
        keepEditingRef={keepEditing}
        finalFocusRef={agentTrigger}
        onSave={async () => {
          const intent = switchIntent.current;
          if (switchTarget && (await editor.save()) && intent === switchIntent.current)
            switchAgent(switchTarget);
        }}
        onDiscard={() => switchTarget && switchAgent(switchTarget)}
        onKeepEditing={keepEditingAgent}
      />
      <audio ref={audioRef} autoPlay />
      <PaneWorkspace
        workspaceTitle={null}
        workspaceLabel={mode === 'call' ? 'Call' : 'Graph'}
        contextTitle={
          mode === 'builder' ? (
            <ContextTabs pane={pane} onChange={setPane} />
          ) : (
            <h2>{mode === 'call' ? 'Call transcript' : detailsTitle}</h2>
          )
        }
        workspace={openContext => (
          <>
            <div className={mode === 'builder' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
              {availableProposal && (
                <ProposalPreviewBanner
                  previewing={preview.previewing}
                  onToggle={preview.toggle}
                  onReview={() => {
                    setPane('copilot');
                    openContext(true);
                  }}
                />
              )}
              <div className="min-h-0 flex-1">
                {preview.previewing && availableProposal && (
                  <AgentGraph
                    key={availableProposal.id}
                    agent={availableProposal.candidate}
                    readOnly
                    proposalChanges={proposalGraphChanges(record.agent, availableProposal.candidate)}
                    focusRequest={preview.focus}
                    selectedNodeId={preview.reference?.node ?? null}
                    selectedTransitionFunction={
                      preview.reference?.kind === 'transition' ? preview.reference.function : null
                    }
                    onSelect={id => {
                      preview.select(id ? { kind: 'node', node: id } : null);
                      if (id) {
                        setPane('details');
                        openContext(true);
                      }
                    }}
                    onSelectTransition={(source, index) => {
                      const edge = availableProposal.candidate.nodes.find(node => node.name === source)
                        ?.edges[index];
                      if (edge) {
                        preview.select({ kind: 'transition', node: source, function: edge.function });
                        setPane('details');
                        openContext(true);
                      }
                    }}
                  />
                )}
                <div className={preview.previewing ? 'hidden' : 'h-full'}>
                  <AgentGraph
                    focusRequest={focusRequest}
                    initialPositions={geometry[record.id]}
                    onPositionsChange={onPositionsChange}
                    selectedTransitionFunction={selectedTransitionFunction}
                    agent={editor.agent}
                    highlights={canvasHighlights}
                    pending={editor.pending || applying}
                    onConnectSteps={(source, target) => {
                      const operations = connectStepOperations(editor.agent, source, target);
                      editor.operate(operations);
                      setSelectedNodeId(source);
                      const added = operations[0];
                      if (added.type === 'add_edge') setSelectedTransitionFunction(added.value.function);
                      openContext();
                    }}
                    onReconnectStep={(source, name, nextSource, target) => {
                      if (editor.reconnect(source, name, nextSource, target)) {
                        setSelectedNodeId(nextSource);
                        setSelectedTransitionFunction(name);
                      }
                      openContext();
                    }}
                    onAddStep={(name, source, end, condition, goal) => {
                      const id = addStep(name, source, end, condition, goal);
                      openContext();
                      return id;
                    }}
                    onDeleteStep={name => {
                      deleteStep(name);
                      openContext();
                    }}
                    selectedNodeId={selectedNodeId}
                    onSelect={id => {
                      selectNode(id);
                      if (id !== null) openContext();
                    }}
                    onSelectTransition={(source, index) => {
                      selectTransition(source, index);
                      openContext();
                    }}
                  />
                </div>
              </div>
            </div>
            {mode === 'call' && <TestCallControls call={call} saved={record} dirty={editor.dirty} />}
          </>
        )}
        context={showWorkspace => (
          <>
            <div className={mode === 'builder' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              <div
                id="details-panel"
                role="tabpanel"
                aria-labelledby="details-tab"
                className={pane === 'details' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
              >
                {preview.previewing && availableProposal ? (
                  <ProposalInspector
                    proposal={availableProposal}
                    selected={preview.reference}
                    onSelect={preview.select}
                    onReview={() => setPane('copilot')}
                  />
                ) : evidence.call ? (
                  <CallDetails
                    call={evidence.call}
                    record={record}
                    highlightTurn={evidence.turn}
                    busy={copilot.busy}
                    onBack={() => {
                      evidence.close();
                      selectNode(null);
                    }}
                    onFocus={focusReference}
                    onInvestigate={() => askCopilot(investigateCallPrompt(evidence.call!))}
                  />
                ) : (
                  <AgentInspector
                    agentSections={
                      <>
                        <AgentBehavior
                          review={copilot.review}
                          revision={record.revision}
                          hasGuidelines={!!record.guidelines.trim()}
                          busy={copilot.busy}
                          onReview={() => askCopilot(REVIEW_BEHAVIOR_PROMPT, 'review')}
                        />
                        <RecentCalls
                          record={record}
                          busy={copilot.busy}
                          onOpen={evidence.open}
                          onReview={() => askCopilot(REVIEW_CALLS_PROMPT)}
                        />
                      </>
                    }
                    editor={editor}
                    onSave={save}
                    agent={agent}
                    selectedNodeId={selectedNodeId}
                    onSelect={selectNode}
                    selectedTransitionFunction={selectedTransitionFunction}
                    onRenameTransition={setSelectedTransitionFunction}
                  />
                )}
              </div>
              <div
                id="copilot-panel"
                role="tabpanel"
                aria-labelledby="copilot-tab"
                className={pane === 'copilot' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
              >
                <CopilotPane
                  copilot={copilot}
                  record={record}
                  selected={selected}
                  dirty={editor.dirty || editor.pending}
                  applying={applying}
                  error={applyError || evidence.error}
                  onOpenCall={async (callId, turn) => {
                    if (await evidence.openCited(callId, turn)) setPane('details');
                  }}
                  onApply={(proposal, base) => void apply(proposal, base)}
                  onFocus={focusReference}
                  onTest={() => setMode('call')}
                  onPreview={(proposal, reference) => {
                    if (proposal.id !== availableProposal?.id) return;
                    preview.show();
                    if (reference) preview.focusReference(reference);
                    showWorkspace();
                  }}
                />
              </div>
            </div>
            {mode === 'call' && <CallTranscript call={call} />}
          </>
        )}
      />
    </main>
  );
}
