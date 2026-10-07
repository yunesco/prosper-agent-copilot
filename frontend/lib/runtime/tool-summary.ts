const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** One line for a tool call in the Test Call transcript, read from the real result. */
export function toolSummary(tool: string, result: unknown): string {
  const r = record(result);
  if (typeof r.error === 'string') return `${tool} → error ${r.status ?? ''}: ${r.error}`.replace('  ', ' ');
  if (tool === 'check_availability') {
    const labels = (Array.isArray(r.slots) ? r.slots : []).map(slot => String(record(slot).label));
    return `${tool} → ${labels.length} open: ${labels.slice(0, 2).join(' · ') || 'none'}`;
  }
  if (tool === 'book_appointment') return `${tool} → confirmed ${r.confirmation_id}: ${r.label}`;
  if (tool === 'lookup_patient')
    return `${tool} → ${r.found ? `found (${r.patient_type} patient)` : 'no record'}`;
  if (tool === 'verify_eligibility')
    return `${tool} → ${r.accepted ? `${r.plan} accepted, $${r.copay} copay` : 'plan not accepted'}`;
  if (tool === 'transfer_to_human') return `${tool} → ${r.status}`;
  return `${tool} → done`;
}
