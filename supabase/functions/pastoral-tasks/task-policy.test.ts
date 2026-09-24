import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {validTaskInput, validTaskTransition} from './task-policy.ts';

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
