import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {validAttachmentInput, validCompletionReport, validTaskInput, validTaskTransition} from './task-policy.ts';

const valid = {
  title: '整理主日投影片', description: '請於週五前完成。', taskType: 'sermon',
  assignedTo: 'd88c69b8-67cb-4ca2-9f01-4c9bd94ceacd',
  idempotencyKey: '19e1ecb5-316d-4ba4-8d8f-364924137bac',
  dueAt: '2026-10-01T09:00:00+08:00',
};

test('accepts bounded task fields and ISO due dates', () => assert.equal(validTaskInput(valid), true));
test('rejects blank or oversized task titles', () => {
  assert.equal(validTaskInput({...valid, title: '   '}), false);
  assert.equal(validTaskInput({...valid, title: 'x'.repeat(201)}), false);
});
test('rejects unsupported task types and malformed identities', () => {
  assert.equal(validTaskInput({...valid, taskType: 'finance'}), false);
  assert.equal(validTaskInput({...valid, assignedTo: 'not-a-uuid'}), false);
});
test('allows only draft, approval, execution, completion transitions', () => {
  assert.equal(validTaskTransition('draft', 'pending'), true);
  assert.equal(validTaskTransition('pending', 'approved'), true);
  assert.equal(validTaskTransition('approved', 'completed'), true);
  assert.equal(validTaskTransition('draft', 'approved'), false);
  assert.equal(validTaskTransition('completed', 'pending'), false);
  assert.equal(validTaskTransition('approved', 'cancelled'), false);
});

test('accepts only supported attachment types and files up to five MiB', () => {
  assert.equal(validAttachmentInput('agenda.pdf', 'application/pdf', 100), true);
  assert.equal(validAttachmentInput('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 5 * 1024 * 1024), true);
  assert.equal(validAttachmentInput('large.pdf', 'application/pdf', 5 * 1024 * 1024 + 1), false);
  assert.equal(validAttachmentInput('script.html', 'text/html', 100), false);
  assert.equal(validAttachmentInput('fake.pdf', 'image/png', 100), false);
});
test('requires a concise completion report before marking work complete', () => {
  assert.equal(validCompletionReport('已整理完成，檔案已附上。'), true);
  assert.equal(validCompletionReport('   '), false);
  assert.equal(validCompletionReport('x'.repeat(3001)), false);
});
