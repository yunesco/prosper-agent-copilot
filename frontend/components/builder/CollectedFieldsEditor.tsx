'use client';

import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AgentEdge } from '@/lib/agent/schema';
import { fieldKey, fieldKind, fieldLabels, removeCollectedField, type FieldDraft } from '@/lib/agent/collected-fields';
import { stepTitle } from '@/lib/agent/graph';

export function CollectedFieldsEditor({ edge, onChange, disabled, draft, onDraft, onDone }: {
  edge: AgentEdge; onChange: (fields: Pick<AgentEdge, 'properties' | 'required'>) => void; disabled: boolean;
  draft?: FieldDraft; onDraft: (draft: FieldDraft | null) => void; onDone: () => void;
}) {
  const update = (changes: Partial<FieldDraft>) => { if (draft) onDraft({ ...draft, ...changes, error: '' }); };
  const fieldEditor = draft ? <section aria-label="Field editor" className="space-y-4 pb-4 pt-3">
      {draft.originalKey === null && <label className="block space-y-1 text-xs">Name<Input aria-label="Information name" value={draft.name ?? ''} onChange={event => update({ name: event.target.value, key: fieldKey(event.target.value) })} /></label>}
      <label className="block space-y-1 text-xs">Field key<Input aria-label="Field key" value={draft.key} onChange={event => update({ key: event.target.value })} /></label>
      <label className="block space-y-1 text-xs">Description<Textarea aria-label="Field description" value={draft.description} onChange={event => update({ description: event.target.value })} /></label>
      <label className="block space-y-1 text-xs">Answer type<Select value={draft.kind} disabled={disabled} onValueChange={kind => {
        if (!kind) return;
        if (kind !== 'choice' && draft.options.length) onDraft({ ...draft, error: 'Remove all choice options before changing the answer type.' });
        else update({ kind });
      }}><SelectTrigger aria-label="Answer type"><SelectValue>{fieldLabels[draft.kind]}</SelectValue></SelectTrigger><SelectContent>{Object.entries(fieldLabels).map(([kind, label]) => <SelectItem key={kind} value={kind}>{label}</SelectItem>)}</SelectContent></Select></label>
      {draft.kind === 'choice' && <div className="space-y-2">{draft.options.map((option, index) => <div key={index} className="flex gap-2"><Input aria-label={`Option ${index + 1}`} value={option} onChange={event => update({ options: draft.options.map((value, i) => i === index ? event.target.value : value) })} /><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Remove option ${index + 1}`} onClick={() => update({ options: draft.options.filter((_, i) => i !== index) })}><X className="size-4" /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => update({ options: [...draft.options, ''] })}>Add option</Button></div>}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><Checkbox disabled={disabled} checked={draft.required} onCheckedChange={required => update({ required })} />Required</label>
      {draft.error && <p role="alert" className="text-xs text-destructive">{draft.error}</p>}
      <div className="flex justify-end gap-2 border-t border-ui-border pt-3"><Button type="button" variant="ghost" size="sm" onClick={() => onDraft(null)}>Cancel field</Button><Button type="button" size="sm" onClick={onDone}>Done</Button></div>
    </section> : null;
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-ui-border pt-5">
    <legend className="sr-only">Information to collect</legend>
    <h3 className="font-medium">Information to collect</h3>
    {Object.entries(edge.properties).map(([key, value]) => {
      const schema = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
      const kind = fieldKind(value);
      const title = stepTitle(key);
      return <section key={key} aria-label={`Collect ${title}`} className="min-w-0 border-b border-ui-border">
        <div className="flex items-start gap-2"><Button type="button" variant="ghost" aria-label={`${title} ${kind ? fieldLabels[kind] : 'Custom schema'}${edge.required.includes(key) ? ' Required' : ''}`} aria-expanded={draft?.originalKey === key} className="h-auto min-w-0 flex-1 items-start justify-start gap-3 rounded-none px-0 py-3 text-left hover:bg-transparent aria-expanded:bg-transparent active:translate-y-0" disabled={(!!draft && draft.originalKey !== key) || !kind} onClick={() => { if (!draft) onDraft({ originalKey: key, key, kind: kind!, description: typeof schema?.description === 'string' ? schema.description : '', options: Array.isArray(schema?.enum) ? schema.enum.filter((item): item is string => typeof item === 'string') : [], required: edge.required.includes(key), error: '' }); }}>
          <span className="min-w-0 flex-1 space-y-1.5"><span className="flex flex-wrap items-baseline gap-2 whitespace-normal break-all"><span className="font-medium">{title}</span><span className="text-xs font-normal text-text-muted">{kind ? fieldLabels[kind] : 'Custom schema'}</span>{edge.required.includes(key) && <span className="text-xs font-normal text-text-muted">Required</span>}</span>
          {typeof schema?.description === 'string' && <span className="block whitespace-normal break-words text-xs font-normal leading-5 text-text-muted">{schema.description}</span>}
          {kind === 'choice' && Array.isArray(schema?.enum) && <span className="flex flex-wrap gap-1">{schema.enum.map((option, index) => <span key={index} className="max-w-full whitespace-normal break-words rounded border border-ui-border px-1.5 py-0.5 text-xs font-normal text-text-muted">{String(option)}</span>)}</span>}
          </span>{draft?.originalKey === key ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-text-subtle" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-text-subtle" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="mt-1.5 shrink-0 text-text-subtle pointer-coarse:size-11" disabled={!!draft} onClick={() => onChange(removeCollectedField(edge, key))} aria-label={`Remove ${title}`}><Trash2 className="size-3.5" /></Button></div>
        {!kind && <p className="text-xs text-text-muted">Edit this field in Advanced JSON.</p>}
        {draft?.originalKey === key && fieldEditor}
      </section>;
    })}
    {draft?.originalKey === null ? fieldEditor : !draft && <Button type="button" variant="ghost" size="sm" className="-ml-2 text-text-muted" onClick={() => onDraft({ originalKey: null, key: '', description: '', kind: 'string', options: [], required: true, error: '' })}><Plus className="size-3.5" />Add information</Button>}
  </fieldset>;
}
