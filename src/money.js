const MAX_CENTS = 100_000_000_00;

export function parseYuan(input) {
  const raw = String(input ?? '').trim().replace(/[¥￥,\s]/g, '');
  if (!raw) throw new Error('请填写金额');
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error('金额请填正数，最多两位小数');
  }
  const [yuan, frac = ''] = raw.split('.');
  const cents = Number(yuan) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isInteger(cents) || cents <= 0) throw new Error('金额要大于 0');
  if (cents > MAX_CENTS) throw new Error('金额过大');
  return cents;
}

export function formatCny(cents) {
  const value = Number(cents) || 0;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const yuan = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}¥${grouped}.${frac}`;
}

/** Split an amount in cents across n people. Earlier slots get the leftover 1-cent pieces. */
export function splitCents(totalCents, count) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error('金额不正确');
  if (!Number.isInteger(count) || count <= 0) throw new Error('请至少勾选一位参与人');
  const base = Math.floor(totalCents / count);
  let remainder = totalCents - base * count;
  const shares = [];
  for (let i = 0; i < count; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    shares.push(base + extra);
  }
  return shares;
}
