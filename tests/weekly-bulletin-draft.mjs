import assert from 'node:assert/strict';
import {test} from 'node:test';
import {continueDraft} from '../weekly-bulletin-draft.mjs';

test('continuing an existing draft opens its latest version without writing it', async () => {
  const opened = [];
  const latest = {id: 'draft-1', version: 37, status: 'changes_requested'};
  const controller = {
    refreshBulletins: async () => [latest],
    open: async (...args) => opened.push(args),
    save: () => {throw new Error('opening a draft must not save it');},
  };
  assert.equal(await continueDraft(controller, 'draft-1'), latest);
  assert.deepEqual(opened, [[latest, {force: true, autofill: false}]]);
});

test('a draft that entered review cannot be reopened as editable', async () => {
  let opened = false;
  const controller = {
    refreshBulletins: async () => [{id: 'draft-1', status: 'pending_review'}],
    open: async () => {opened = true;},
  };
  await assert.rejects(continueDraft(controller, 'draft-1'), /狀態已變更/);
  assert.equal(opened, false);
});
