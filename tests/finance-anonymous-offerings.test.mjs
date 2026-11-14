import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousOfferingName, anonymousOfferingNames, nextAnonymousOfferingName } from '../finance/anonymous-offerings.mjs';

test('主知名 uses Chinese sequence numbers including ten and larger values', () => {
  for (const [number, suffix] of [[1,'一'],[2,'二'],[9,'九'],[10,'十'],[11,'十一'],[20,'二十'],[21,'二十一'],[100,'一百'],[101,'一百零一'],[110,'一百一十'],[1001,'一千零一'],[9999,'九千九百九十九']]) {
    assert.equal(anonymousOfferingName(number), '主知名'+suffix);
  }
});

test('ordinary and electronic donors do not consume anonymous sequence numbers', () => {
  const groups = [{name:'一般奉獻人'}, {anonymous:true,name:'主知名一'}, {name:'線上奉獻人'}, {anonymous:true,name:'主知名二'}];
  assert.equal(nextAnonymousOfferingName(groups), '主知名三');
  groups.splice(1,1);
  assert.equal(nextAnonymousOfferingName(groups), '主知名三');
  assert.equal(anonymousOfferingNames(groups).get(groups[2]), '主知名二');
  assert.equal(nextAnonymousOfferingName([]), '主知名一');
});

test('old anonymous records get safe labels without changing raw records or amounts', () => {
  const groups = [{anonymous:true,name:'匿名',amount:16800}, {anonymous:true,name:'主知名二',amount:400}, {anonymous:true,name:'真實姓名不得顯示',amount:100}];
  const before = structuredClone(groups), names = anonymousOfferingNames(groups);
  assert.deepEqual([...names.values()].sort(), ['主知名一','主知名三','主知名二'].sort());
  assert.equal(names.get(groups[0]), '主知名一');
  assert.equal(names.get(groups[1]), '主知名二');
  assert.equal(names.get(groups[2]), '主知名三');
  assert.equal(nextAnonymousOfferingName(groups), '主知名四');
  assert.deepEqual(groups, before);
});

test('duplicate persisted names are separated without colliding with reserved numbers', () => {
  const groups = [{anonymous:true,name:'主知名一'}, {anonymous:true,name:'主知名一'}, {anonymous:true,name:'主知名二'}];
  assert.deepEqual(groups.map(group=>anonymousOfferingNames(groups).get(group)), ['主知名一','主知名三','主知名二']);
});
