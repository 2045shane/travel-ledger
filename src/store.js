const KEY = 'travel-ledger:v1';
const MAX_CENTS = 100_000_000_00;

export function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return crypto.randomUUID();
}

function emptyState() {
  return { version: 1, trips: [] };
}

function cleanText(value, { empty, max, tooLong }) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) throw new Error(empty);
  if ([...text].length > max) throw new Error(tooLong);
  return text;
}

function cleanNote(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if ([...text].length > 40) throw new Error('说明请控制在 40 字以内');
  return text;
}

function assertCents(cents) {
  if (!Number.isInteger(cents) || cents <= 0 || cents > MAX_CENTS) {
    throw new Error('金额不正确');
  }
}

export function createStore(storage) {
  function read() {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.trips)) return emptyState();
      return data;
    } catch (error) {
      if (error instanceof SyntaxError) return emptyState();
      throw error;
    }
  }

  function write(state) {
    try {
      storage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error('这台浏览器存不下更多账。请先导出备份，或删掉旧账本。');
    }
  }

  function updateTrip(tripId, mutate) {
    const state = read();
    const trip = state.trips.find((item) => item.id === tripId);
    if (!trip) throw new Error('找不到这个账本');
    mutate(trip);
    trip.updatedAt = nowIso();
    write(state);
    return trip;
  }

  function requireMembers(trip, ids, message) {
    for (const id of ids) {
      if (!trip.members.some((member) => member.id === id)) throw new Error(message);
    }
  }

  return {
    key: KEY,

    listTrips() {
      return read()
        .trips.slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    getTrip(id) {
      return read().trips.find((trip) => trip.id === id) || null;
    },

    createTrip(title) {
      const name = cleanText(title, {
        empty: '请填写行程标题',
        max: 40,
        tooLong: '标题请控制在 40 字以内',
      });
      const state = read();
      const timestamp = nowIso();
      const trip = {
        id: uid(),
        title: name,
        createdAt: timestamp,
        updatedAt: timestamp,
        members: [],
        entries: [],
      };
      state.trips.push(trip);
      write(state);
      return trip;
    },

    deleteTrip(tripId) {
      const state = read();
      const next = state.trips.filter((trip) => trip.id !== tripId);
      if (next.length === state.trips.length) throw new Error('找不到这个账本');
      write({ version: 1, trips: next });
    },

    addMember(tripId, nickname) {
      const name = cleanText(nickname, {
        empty: '请填写昵称',
        max: 16,
        tooLong: '昵称请控制在 16 字以内',
      });
      return updateTrip(tripId, (trip) => {
        if (trip.members.some((member) => member.nickname === name)) {
          throw new Error('这个昵称已经在账本里');
        }
        trip.members.push({ id: uid(), nickname: name, createdAt: nowIso() });
      });
    },

    removeMember(tripId, memberId) {
      return updateTrip(tripId, (trip) => {
        const used = trip.entries.some((entry) => (
          entry.payerMemberId === memberId
          || entry.prepaidMemberId === memberId
          || entry.receiverMemberId === memberId
          || (entry.participantMemberIds || []).includes(memberId)
        ));
        if (used) throw new Error('这个昵称已经记在账上，不能去掉');
        trip.members = trip.members.filter((member) => member.id !== memberId);
      });
    },

    addExpense(tripId, input) {
      assertCents(input.amountCents);
      const note = cleanNote(input.note);
      return updateTrip(tripId, (trip) => {
        if (trip.members.length === 0) throw new Error('先添加成员');
        requireMembers(trip, [input.payerMemberId], '请选择付款人');
        const selected = new Set(input.participantMemberIds || []);
        const participantMemberIds = trip.members
          .map((member) => member.id)
          .filter((id) => selected.has(id));
        if (participantMemberIds.length === 0) throw new Error('请至少勾选一位参与人');
        const timestamp = nowIso();
        trip.entries.push({
          id: uid(),
          kind: 'expense',
          amountCents: input.amountCents,
          note,
          payerMemberId: input.payerMemberId,
          participantMemberIds,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
    },

    addPrepaid(tripId, input) {
      assertCents(input.amountCents);
      const note = cleanNote(input.note);
      if (input.prepaidMemberId === input.receiverMemberId) {
        throw new Error('预缴人和收款人要是两个人');
      }
      return updateTrip(tripId, (trip) => {
        requireMembers(trip, [input.prepaidMemberId, input.receiverMemberId], '请选择预缴人和收款人');
        const timestamp = nowIso();
        trip.entries.push({
          id: uid(),
          kind: 'prepaid',
          amountCents: input.amountCents,
          note,
          prepaidMemberId: input.prepaidMemberId,
          receiverMemberId: input.receiverMemberId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      });
    },

    deleteEntry(tripId, entryId) {
      return updateTrip(tripId, (trip) => {
        const next = trip.entries.filter((entry) => entry.id !== entryId);
        if (next.length === trip.entries.length) throw new Error('找不到这笔账');
        trip.entries = next;
      });
    },

    exportJson() {
      return JSON.stringify({
        app: 'travel-ledger',
        version: 1,
        exportedAt: nowIso(),
        trips: read().trips,
      }, null, 2);
    },

    importJson(text) {
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('这个文件不是 JSON');
      }
      if (!data || data.app !== 'travel-ledger' || data.version !== 1 || !Array.isArray(data.trips)) {
        throw new Error('这不是出游记账的备份文件');
      }
      for (const trip of data.trips) validateTrip(trip);
      write({ version: 1, trips: data.trips });
    },
  };
}

function validateTrip(trip) {
  if (!trip || typeof trip.id !== 'string' || typeof trip.title !== 'string') {
    throw new Error('备份里的账本不完整');
  }
  if (!Array.isArray(trip.members) || !Array.isArray(trip.entries)) {
    throw new Error('备份里的账本不完整');
  }
  const ids = new Set();
  for (const member of trip.members) {
    if (!member || typeof member.id !== 'string' || typeof member.nickname !== 'string' || !member.nickname) {
      throw new Error('备份里的成员不完整');
    }
    if (ids.has(member.id)) throw new Error('备份里有重复成员');
    ids.add(member.id);
  }
  for (const entry of trip.entries) {
    if (!entry || typeof entry.id !== 'string') throw new Error('备份里的账目不完整');
    assertCents(entry.amountCents);
    if (entry.kind === 'expense') {
      if (!ids.has(entry.payerMemberId)) throw new Error('备份里的付款人不在成员中');
      if (!Array.isArray(entry.participantMemberIds) || entry.participantMemberIds.length === 0) {
        throw new Error('备份里有一笔费用没有参与人');
      }
      if (entry.participantMemberIds.some((id) => !ids.has(id))) {
        throw new Error('备份里的参与人不在成员中');
      }
      continue;
    }
    if (entry.kind === 'prepaid') {
      if (!ids.has(entry.prepaidMemberId) || !ids.has(entry.receiverMemberId)) {
        throw new Error('备份里的预缴成员不完整');
      }
      if (entry.prepaidMemberId === entry.receiverMemberId) {
        throw new Error('备份里的预缴人和收款人相同');
      }
      continue;
    }
    throw new Error('备份里有无法识别的账');
  }
}
