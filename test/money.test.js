import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCny, parseYuan, splitCents } from '../src/money.js';

test('parseYuan accepts CNY with at most two decimals', () => {
  assert.equal(parseYuan('340'), 34000);
  assert.equal(parseYuan('340.5'), 34050);
  assert.equal(parseYuan('340.50'), 34050);
  assert.equal(parseYuan('¥340'), 34000);
  assert.equal(parseYuan('￥1,234.50'), 123450);
  assert.equal(parseYuan(' 0.01 '), 1);
});

test('parseYuan rejects empty, zero, and extra decimals', () => {
  assert.throws(() => parseYuan(''), /请填写金额/);
  assert.throws(() => parseYuan('0'), /大于 0/);
  assert.throws(() => parseYuan('340.555'), /两位小数/);
  assert.throws(() => parseYuan('12.3.4'), /两位小数/);
});

test('formatCny groups yuan and keeps the sign', () => {
  assert.equal(formatCny(0), '¥0.00');
  assert.equal(formatCny(1), '¥0.01');
  assert.equal(formatCny(34000), '¥340.00');
  assert.equal(formatCny(100000), '¥1,000.00');
  assert.equal(formatCny(-17000), '-¥170.00');
});

test('splitCents divides evenly and gives leftover cents to earlier people', () => {
  assert.deepEqual(splitCents(34000, 2), [17000, 17000]);
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  const shares = splitCents(100, 3);
  assert.equal(shares.reduce((sum, part) => sum + part, 0), 100);
  assert.throws(() => splitCents(100, 0), /参与人/);
});
