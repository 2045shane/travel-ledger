import assert from 'node:assert/strict';
import test from 'node:test';
import { settle } from '../src/settle.js';

function trip(entries) {
  return {
    members: [
      { id: 'me', nickname: '我' },
      { id: 'wang', nickname: '王' },
      { id: 'li', nickname: '李' },
    ],
    entries,
  };
}

test('340 yuan lunch splits only between the checked people', () => {
  const result = settle(trip([{
    id: 'lunch',
    kind: 'expense',
    amountCents: 34000,
    note: '午饭',
    payerMemberId: 'me',
    participantMemberIds: ['me', 'wang'],
    createdAt: '2026-10-28T09:00:00.000Z',
    updatedAt: '2026-10-28T09:00:00.000Z',
  }]));

  assert.equal(result.totalSpend, 34000);
  assert.equal(result.totalPrepaid, 0);
  const nets = Object.fromEntries(result.people.map((person) => [person.member.nickname, person.net]));
  assert.deepEqual(nets, { 我: 17000, 王: -17000, 李: 0 });
  assert.equal(result.lines[0].shareMap.me, 17000);
  assert.equal(result.lines[0].shareMap.wang, 17000);
  assert.equal(result.lines[0].shareMap.li, undefined);
});

test('settlement still balances when nobody recorded a prepaid', () => {
  const result = settle(trip([{
    id: 'ticket',
    kind: 'expense',
    amountCents: 9000,
    note: '车票',
    payerMemberId: 'li',
    participantMemberIds: ['me', 'li'],
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  }]));
  const sum = result.people.reduce((total, person) => total + person.net, 0);
  assert.equal(sum, 0);
  assert.equal(result.totalPrepaid, 0);
  assert.equal(result.people.find((person) => person.member.id === 'wang').net, 0);
});

test('prepaid moves net between two people and stays out of total spend', () => {
  const result = settle(trip([
    {
      id: 'lunch',
      kind: 'expense',
      amountCents: 34000,
      note: '午饭',
      payerMemberId: 'me',
      participantMemberIds: ['me', 'wang'],
      createdAt: '2026-10-28T09:00:00.000Z',
      updatedAt: '2026-10-28T09:00:00.000Z',
    },
    {
      id: 'advance',
      kind: 'prepaid',
      amountCents: 10000,
      note: '出发前',
      prepaidMemberId: 'wang',
      receiverMemberId: 'me',
      createdAt: '2026-10-28T08:00:00.000Z',
      updatedAt: '2026-10-28T08:00:00.000Z',
    },
  ]));

  assert.equal(result.totalSpend, 34000);
  assert.equal(result.totalPrepaid, 10000);
  const nets = Object.fromEntries(result.people.map((person) => [person.member.nickname, person.net]));
  assert.deepEqual(nets, { 我: 7000, 王: -7000, 李: 0 });
  assert.equal(result.people.reduce((total, person) => total + person.net, 0), 0);
});

test('a payer who did not eat is owed the whole amount', () => {
  const result = settle(trip([{
    id: 'dinner',
    kind: 'expense',
    amountCents: 20000,
    note: '晚饭',
    payerMemberId: 'li',
    participantMemberIds: ['me', 'wang'],
    createdAt: '2026-10-28T12:00:00.000Z',
    updatedAt: '2026-10-28T12:00:00.000Z',
  }]));
  const nets = Object.fromEntries(result.people.map((person) => [person.member.nickname, person.net]));
  assert.deepEqual(nets, { 我: -10000, 王: -10000, 李: 20000 });
});
