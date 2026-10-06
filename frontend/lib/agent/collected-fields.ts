import type { AgentEdge } from './schema';

export type FieldKind = 'string' | 'choice' | 'number' | 'integer' | 'boolean';
export type FieldDraft = { name?: string; originalKey: string | null; key: string; description: string; kind: FieldKind; options: string[]; required: boolean; error: string };
export const fieldLabels = { string: 'Text', choice: 'Choice', number: 'Number', integer: 'Whole number', boolean: 'Yes / No' };
export const fieldKey = (name: string) => name.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export function fieldKind(value: unknown): FieldKind | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const schema = value as Record<string, unknown>;
  if (['oneOf', 'anyOf', 'allOf', '$ref', 'not', 'if', 'const'].some(key => key in schema)) return null;
  if ('enum' in schema) return schema.type === 'string' && Array.isArray(schema.enum) && schema.enum.every(option => typeof option === 'string') ? 'choice' : null;
  return ['string', 'number', 'integer', 'boolean'].includes(String(schema.type)) ? schema.type as FieldKind : null;
}
export function editCollectedField(edge: AgentEdge, draft: FieldDraft) {
  const key = draft.key.trim();
  if (!key) throw new Error('Enter a field key.');
  if (key !== draft.originalKey && Object.hasOwn(edge.properties, key)) throw new Error('This field key already exists.');
  if (draft.originalKey !== null && !Object.hasOwn(edge.properties, draft.originalKey)) throw new Error('This field no longer exists.');
  const original = draft.originalKey === null ? {} : edge.properties[draft.originalKey];
  if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error('Edit this custom schema in Advanced JSON.');
  if (draft.kind !== 'choice' && draft.options.length) throw new Error('Remove all choice options before changing the answer type.');
  if (draft.kind === 'choice' && (!draft.options.length || draft.options.some(option => !option.trim()))) throw new Error('Enter a value for every choice option.');
  if (new Set(draft.options.map(option => option.trim())).size !== draft.options.length) throw new Error('Choice options must be unique.');
  const schema: AgentEdge['properties'] = { ...original, type: draft.kind === 'choice' ? 'string' : draft.kind, description: draft.description };
  if (draft.kind === 'choice') schema.enum = [...draft.options];
  else delete schema.enum;
  const properties = Object.fromEntries([...Object.entries(edge.properties).map(([name, value]) => name === draft.originalKey ? [key, schema] : [name, value]), ...(draft.originalKey === null ? [[key, schema]] : [])]);
  const required = edge.required.flatMap(name => name === draft.originalKey ? (draft.required ? [key] : []) : [name]);
  if (draft.required && !required.includes(key)) required.push(key);
  return { properties, required };
}
export function removeCollectedField(edge: AgentEdge, key: string) {
  if (!Object.hasOwn(edge.properties, key)) throw new Error('This field no longer exists.');
  const properties = { ...edge.properties };
  delete properties[key];
  return { properties, required: edge.required.filter(name => name !== key) };
}
