import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore, memoryStorage } from '../src/store.js';

test('two trip titles stay isolated and survive a new store on the same storage', async () => {
  const storage = memoryStorage();
  const ledger = createStore(storage);
  const hangzhou = ledger.createTrip('杭州周末');
  const kyoto = ledger.createTrip('京都五日');
  ledger.addMember(hangzhou.id, '我');
  ledger.addMember(hangzhou.id, '王');
  const me = ledger.getTrip(hangzhou.id).members[0];
  const wang = ledger.getTrip(hangzhou.id).members[1];
  const before = ledger.getTrip(hangzhou.id).updatedAt;
  await new Promise((resolve) => setTimeout(resolve, 5));
  ledger.addExpense(hangzhou.id, {
    amountCents: 34000,
    note: '午饭',
    payerMemberId: me.id,
    participantMemberIds: [me.id, wang.id],
  });

  const savedHangzhou = ledger.getTrip(hangzhou.id);
  const savedKyoto = ledger.getTrip(kyoto.id);
  assert.equal(savedHangzhou.entries.length, 1);
  assert.equal(savedKyoto.entries.length, 0);
  assert.equal(savedKyoto.members.length, 0);
  assert.notEqual(savedHangzhou.updatedAt, before);
  assert.equal(savedHangzhou.entries[0].createdAt, savedHangzhou.entries[0].updatedAt);
  assert.ok(savedHangzhou.entries[0].createdAt);

  const reopened = createStore(storage);
  assert.equal(reopened.listTrips().length, 2);
  assert.equal(reopened.getTrip(hangzhou.id).entries[0].note, '午饭');
  assert.deepEqual(
    reopened.listTrips().map((trip) => trip.title).sort(),
    ['京都五日', '杭州周末'],
  );
});

test('unchecked participants are not stored, and duplicate nicknames are refused', () => {
  const ledger = createStore(memoryStorage());
  const trip = ledger.createTrip('杭州周末');
  ledger.addMember(trip.id, '我');
  ledger.addMember(trip.id, '王');
  ledger.addMember(trip.id, '李');
  assert.throws(() => ledger.addMember(trip.id, '王'), /已经在账本里/);

  const members = ledger.getTrip(trip.id).members;
  const byName = Object.fromEntries(members.map((member) => [member.nickname, member.id]));
  ledger.addExpense(trip.id, {
    amountCents: 34000,
    note: '午饭',
    payerMemberId: byName['我'],
    participantMemberIds: [byName['我'], byName['王']],
  });
  const entry = ledger.getTrip(trip.id).entries[0];
  assert.deepEqual(entry.participantMemberIds, [byName['我'], byName['王']]);
  assert.equal(entry.participantMemberIds.includes(byName['李']), false);
  assert.throws(() => ledger.removeMember(trip.id, byName['我']), /不能去掉/);
});

test('prepaid is optional and a bad import does not wipe existing trips', () => {
  const ledger = createStore(memoryStorage());
  const trip = ledger.createTrip('杭州周末');
  ledger.addMember(trip.id, '我');
  ledger.addMember(trip.id, '王');
  const [me, wang] = ledger.getTrip(trip.id).members;
  ledger.addPrepaid(trip.id, {
    amountCents: 10000,
    note: '出发前',
    prepaidMemberId: wang.id,
    receiverMemberId: me.id,
  });
  const entry = ledger.getTrip(trip.id).entries[0];
  assert.equal(entry.kind, 'prepaid');
  assert.ok(entry.createdAt);
  assert.ok(entry.updatedAt);

  const backup = ledger.exportJson();
  assert.equal(JSON.parse(backup).app, 'travel-ledger');
  assert.throws(() => ledger.importJson('{"app":"other"}'), /不是出游记账/);
  assert.equal(ledger.getTrip(trip.id).title, '杭州周末');

  ledger.importJson(backup);
  assert.equal(ledger.getTrip(trip.id).entries[0].kind, 'prepaid');
  assert.throws(() => ledger.addPrepaid(trip.id, {
    amountCents: 100,
    note: '',
    prepaidMemberId: me.id,
    receiverMemberId: me.id,
  }), /两个人/);
});
