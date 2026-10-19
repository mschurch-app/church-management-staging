import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeSurveyAnswers } from '../supabase/functions/pastoral-workflow-survey/validation.mjs';

const valid = {
  areas: ['教會行政'],
  routineTasks: [{ title: '每週核對行政待辦', cadence: 'weekly', timing: 'wednesday', doneMeans: '負責同工收到確認', needsReminder: true }],
  frictions: ['缺少到期提醒'],
  improvements: ['我的每週清單'],
  reminderChannel: 'app', reminderLead: 'day_before',
};

test('keeps one actionable routine and authorized response choices', () => {
  const result = normalizeSurveyAnswers(valid);
  assert.deepEqual(result.areas, ['教會行政']);
  assert.deepEqual(result.routineTasks, valid.routineTasks);
  assert.deepEqual(result.frictions, ['缺少到期提醒']);
  assert.equal(result.reminderChannel, 'app');
  assert.equal(result.osUsage, 'rarely');
});

test('rejects missing redesign evidence instead of saving an empty form', () => {
  assert.throws(() => normalizeSurveyAnswers({ ...valid, routineTasks: [] }), /task_required/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, frictions: [] }), /friction_required/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, improvements: [] }), /improvement_required/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, areas: [] }), /area_required/);
});

test('rejects malformed task structures and a response longer than the stated limit', () => {
  assert.throws(() => normalizeSurveyAnswers({ ...valid, routineTasks: [{ title: '工作', cadence: 'unknown' }] }), /invalid_task/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, routineTasks: Array(9).fill(valid.routineTasks[0]) }), /too_many_tasks/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, routineTasks: [null] }), /invalid_task/);
});

test('drops unsupported choice values and trims free text', () => {
  const result = normalizeSurveyAnswers({
    ...valid, areas: ['教會行政', '教會行政', 'unsupported'],
    routineTasks: [{ ...valid.routineTasks[0], title: '  每週核對行政待辦  ', timing: 'unsupported' }],
    currentTools: ['LINE 訊息', 'unknown'],
  });
  assert.deepEqual(result.areas, ['教會行政']);
  assert.equal(result.routineTasks[0].title, '每週核對行政待辦');
  assert.equal(result.routineTasks[0].timing, 'varies');
  assert.deepEqual(result.currentTools, ['LINE 訊息']);
});

test('supports infrequent work and an honest no-friction answer without contradictory choices', () => {
  const result = normalizeSurveyAnswers({
    ...valid, osUsage: 'never',
    routineTasks: [{ title: '服事調查', cadence: 'bimonthly', timing: 'varies', needsReminder: true }],
    frictions: ['目前沒有明顯阻礙'], improvements: ['目前不需要新功能'],
  });
  assert.equal(result.routineTasks[0].cadence, 'bimonthly');
  assert.equal(result.routineTasks[0].needsReminder, true);
  assert.equal(result.osUsage, 'never');
  assert.throws(() => normalizeSurveyAnswers({ ...valid, frictions: ['目前沒有明顯阻礙', '通知太多'] }), /invalid_frictions/);
  assert.throws(() => normalizeSurveyAnswers({ ...valid, improvements: ['目前不需要新功能', '我的每週清單'] }), /invalid_improvements/);
});
