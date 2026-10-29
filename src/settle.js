import { splitCents } from './money.js';

/**
 * Expense: the payer fronted the full amount. Checked participants share it equally.
 * Prepaid: one member handed cash to another. It is not spend.
 * Net = paid expenses + prepaid given − own share − prepaid received.
 * Positive net is 应收. Negative net is 应付.
 */
export function settle(trip) {
  const members = trip.members || [];
  const entries = trip.entries || [];
  const known = new Set(members.map((member) => member.id));
  const totals = new Map(
    members.map((member) => [member.id, { paid: 0, share: 0, prepaidOut: 0, prepaidIn: 0 }]),
  );

  const lines = [];
  let totalSpend = 0;
  let totalPrepaid = 0;

  for (const entry of entries) {
    if (entry.kind === 'expense') {
      const participants = (entry.participantMemberIds || []).filter((id) => known.has(id));
      const shareMap = {};
      if (participants.length > 0) {
        const shares = splitCents(entry.amountCents, participants.length);
        participants.forEach((id, index) => {
          shareMap[id] = shares[index];
          totals.get(id).share += shares[index];
        });
      }
      if (known.has(entry.payerMemberId)) {
        totals.get(entry.payerMemberId).paid += entry.amountCents;
      }
      totalSpend += entry.amountCents;
      lines.push({ entry, shareMap, participants });
      continue;
    }

    if (entry.kind === 'prepaid') {
      if (known.has(entry.prepaidMemberId)) {
        totals.get(entry.prepaidMemberId).prepaidOut += entry.amountCents;
      }
      if (known.has(entry.receiverMemberId)) {
        totals.get(entry.receiverMemberId).prepaidIn += entry.amountCents;
      }
      totalPrepaid += entry.amountCents;
      lines.push({ entry, shareMap: {}, participants: [] });
    }
  }

  const people = members.map((member) => {
    const row = totals.get(member.id);
    const net = row.paid + row.prepaidOut - row.share - row.prepaidIn;
    return { member, ...row, net };
  });

  return { totalSpend, totalPrepaid, people, lines };
}

export function lineFor(result, entryId) {
  return result.lines.find((line) => line.entry.id === entryId) || null;
}
