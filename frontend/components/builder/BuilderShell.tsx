'use client';

import { useCallback, useEffect, useState } from 'react';
import type { XYPosition } from '@xyflow/react';
import { Button } from '@/components/ui/Button';
import { commitAgent, LocalAgentRepository, minimalAgent, type AgentDocument } from '@/lib/agent/repository';
import { AgentWorkspace } from './AgentWorkspace';

/** Opens the local saved-agent document and hands the selected agent to its workspace. */
export function BuilderShell() {
  const [repository] = useState(() => new LocalAgentRepository());
  const [document, setDocument] = useState<AgentDocument | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [geometry, setGeometry] = useState<Record<string, Record<string, XYPosition>>>(() => ({}));
  const saveGeometry = useCallback((id: string, positions: Record<string, XYPosition>) => {
    setGeometry(current => (current[id] === positions ? current : { ...current, [id]: positions }));
  }, []);
  useEffect(() => {
    let active = true;
    void repository
      .initialize()
      .then(doc => {
        if (active) {
          setDocument(doc);
          setError('');
        }
      })
      .catch(error => {
        if (active) setError(error instanceof Error ? error.message : 'Could not open saved agents.');
      });
    return () => {
      active = false;
    };
  }, [repository, attempt]);
  if (!document)
    return (
      <main className="p-6">
        <h1 className="text-lg font-semibold">Agent builder</h1>
        {error ? (
          <>
            <p role="alert" className="my-4">
              {error}
            </p>
            <Button onClick={() => setAttempt(value => value + 1)}>Retry storage</Button>
          </>
        ) : (
          <p role="status">Loading saved agents…</p>
        )}
      </main>
    );
  const selected = document.agents.find(record => record.id === document.selectedId)!;
  return (
    <AgentWorkspace
      key={selected.id}
      initial={selected}
      repository={repository}
      records={document.agents}
      geometry={geometry}
      saveGeometry={saveGeometry}
      onSwitch={id => {
        const record = repository.selectAgent(id);
        setDocument(
          current =>
            current && {
              ...current,
              selectedId: id,
              agents: current.agents.map(item => (item.id === id ? record : item)),
            },
        );
      }}
      onDelete={id => setDocument(repository.deleteAgent(id))}
      onRename={async (id, name) => {
        const base = document.agents.find(item => item.id === id)!;
        const saved = await commitAgent(
          repository,
          base,
          [{ type: 'update_agent', changes: { name } }],
          base.guidelines,
          () => {},
        );
        setDocument(
          current =>
            current && { ...current, agents: current.agents.map(item => (item.id === id ? saved : item)) },
        );
      }}
      onCreate={async name => {
        const record = await repository.createAgent({ agent: minimalAgent(name), guidelines: '' });
        repository.selectAgent(record.id);
        setDocument(
          current => current && { ...current, selectedId: record.id, agents: [...current.agents, record] },
        );
      }}
      onSaved={record =>
        setDocument(
          current =>
            current && {
              ...current,
              agents: current.agents.map(item => (item.id === record.id ? record : item)),
            },
        )
      }
    />
  );
}
