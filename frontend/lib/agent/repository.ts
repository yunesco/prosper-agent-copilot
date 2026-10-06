import { z } from 'zod';
import { agentSchema, parseAgent } from './schema';
import { applyAgentOperations, type AgentOperation } from './operations';
import { loadAgentFixture, loadDemoContext } from '../fixtures';
import { validateAgent } from '../runtime/validation';

export const savedAgentSchema = z.object({ id: z.string().min(1), revision: z.number().int().positive(), agent: agentSchema.transform(parseAgent), guidelines: z.string() });
export type SavedAgent = z.output<typeof savedAgentSchema>;
type Candidate = Pick<SavedAgent, 'agent' | 'guidelines'>;
const candidateSchema = savedAgentSchema.pick({ agent: true, guidelines: true });
const documentSchema = z.object({ version: z.literal(1), selectedId: z.string(), agents: z.array(savedAgentSchema).min(1) }).superRefine((doc, ctx) => {
  if (new Set(doc.agents.map(agent => agent.id)).size !== doc.agents.length || !doc.agents.some(agent => agent.id === doc.selectedId)) ctx.addIssue({ code: 'custom', message: 'Invalid saved agent selection or duplicate ID.' });
});
export type AgentDocument = z.output<typeof documentSchema>;
export const STORAGE_KEY = 'prosper.agents.v1';
export interface AgentRepository {
  getAgent(id: string): Promise<SavedAgent>;
  createAgent(candidate: Candidate): Promise<SavedAgent>;
  saveAgent(id: string, candidate: Candidate, expectedRevision: number, assertActive?: () => void): Promise<SavedAgent>;
}
const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  const left = Object.entries(a), right = Object.entries(b);
  return left.length === right.length && left.every(([key, value]) => Object.hasOwn(b, key) && same(value, Reflect.get(b, key)));
};

// Storage is acquired lazily: denied access is an error, never an ephemeral repository.
export class LocalAgentRepository implements AgentRepository {
  constructor(private storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage, private validate = validateAgent, private newId = () => crypto.randomUUID()) {}
  private read(): AgentDocument | null {
    const raw = this.storage().getItem(STORAGE_KEY);
    if (raw === null) return null;
    try { return documentSchema.parse(JSON.parse(raw)); }
    catch { throw new Error('Saved agent storage is malformed or uses an unsupported version. Existing data was preserved.'); }
  }
  private required() { const doc = this.read(); if (!doc) throw new Error('Saved agent storage is missing. Reload and try again.'); return doc; }
  private write(doc: AgentDocument) { this.storage().setItem(STORAGE_KEY, JSON.stringify(doc)); }
  async initialize(): Promise<AgentDocument> {
    const existing = this.read(); if (existing) return existing;
    const agents: SavedAgent[] = [
      { id: this.newId(), revision: 1, guidelines: '', agent: parseAgent({ name: 'New clinic agent', initial_node: 'start', nodes: [{ name: 'start', end: true, task_messages: [{ role: 'system', content: 'Say goodbye.' }] }] }) },
      { id: 'clinic-scheduler', revision: 1, guidelines: loadDemoContext().guidelines[0].text, agent: loadAgentFixture('clinic-scheduler') },
    ];
    await Promise.all(agents.map(record => this.validate(record.agent)));
    // Another initialization may have completed while validation was pending.
    const latest = this.read(); if (latest) return latest;
    const doc = documentSchema.parse({ version: 1, selectedId: agents[0].id, agents });
    this.write(doc); return doc;
  }
  async getAgent(id: string) { const record = this.required().agents.find(agent => agent.id === id); if (!record) throw new Error('Saved agent not found.'); return record; }
  selectAgent(id: string) { const doc = this.required(); if (!doc.agents.some(agent => agent.id === id)) throw new Error('Saved agent not found.'); this.write({ ...doc, selectedId: id }); return doc.agents.find(agent => agent.id === id)!; }
  async createAgent(input: Candidate) {
    const candidate = candidateSchema.parse(input); await this.validate(candidate.agent);
    const doc = this.required(); const record = savedAgentSchema.parse({ ...candidate, id: this.newId(), revision: 1 });
    if (doc.agents.some(agent => agent.id === record.id)) throw new Error('Agent ID already exists.');
    this.write({ ...doc, agents: [...doc.agents, record] }); return record;
  }
  async saveAgent(id: string, input: Candidate, expectedRevision: number, assertActive = () => {}) {
    const candidate = candidateSchema.parse(input); await this.validate(candidate.agent);
    assertActive();
    // No await between the final read/revision check and write: same-app commits serialize.
    const doc = this.required(); const base = doc.agents.find(agent => agent.id === id);
    if (!base || base.revision !== expectedRevision) throw new Error('The saved agent changed. Cancel edits and reload before saving again.');
    if (same(base.agent, candidate.agent) && base.guidelines === candidate.guidelines) return base;
    const record = { ...candidate, id, revision: base.revision + 1 };
    this.write({ ...doc, agents: doc.agents.map(agent => agent.id === id ? record : agent) }); return record;
  }
}

export function commitAgent(repository: AgentRepository, base: SavedAgent, operations: AgentOperation[], guidelines: string, assertActive: () => void) {
  assertActive();
  return repository.saveAgent(base.id, { agent: applyAgentOperations(base.agent, operations), guidelines }, base.revision, assertActive);
}
