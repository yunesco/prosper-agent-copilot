import { expect, it } from 'vitest';
import { toolSummary } from './tool-summary';

it('summarises each tool result in one line, including failures', () => {
  expect(
    toolSummary('check_availability', {
      slots: [{ label: 'Monday at 9:00 AM' }, { label: 'Wednesday at 1:00 PM' }],
    }),
  ).toBe('check_availability → 2 open: Monday at 9:00 AM · Wednesday at 1:00 PM');
  expect(toolSummary('book_appointment', { confirmation_id: 'A101', label: 'Monday at 9:00 AM' })).toBe(
    'book_appointment → confirmed A101: Monday at 9:00 AM',
  );
  expect(toolSummary('book_appointment', { error: 'That slot was just taken.', status: 409 })).toBe(
    'book_appointment → error 409: That slot was just taken.',
  );
  expect(toolSummary('lookup_patient', { found: false })).toBe('lookup_patient → no record');
});
