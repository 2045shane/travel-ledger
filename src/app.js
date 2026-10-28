import { formatTime, escapeHtml as esc } from './format.js';
import { formatCny, parseYuan, splitCents } from './money.js';
import { lineFor, settle } from './settle.js';
import { createStore } from './store.js';

const store = createStore(localStorage);

const ui = {
  tab: 'expense',
  banner: null,
  confirm: null,
  pendingImport: null,
};

let root = null;
let keepBanner = false;

export function startApp(mount) {
  root = mount;
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onField);
  root.addEventListener('change', onField);
  window.addEventListener('hashchange', () => {
    if (!keepBanner) ui.banner = null;
    keepBanner = false;
    ui.confirm = null;
    if (parseRoute().name === 'home') ui.tab = 'expense';
    render();
  });

  if (!location.hash || location.hash === '#') {
    history.replaceState(null, '', '#/');
  }
  render();
}

function parseRoute() {
  const hash = (location.hash || '#/').replace(/^#/, '') || '/';
  const settleMatch = hash.match(/^\/t\/([^/]+)\/settle\/?$/);
  if (settleMatch) return { name: 'settle', tripId: decodeURIComponent(settleMatch[1]) };
  const tripMatch = hash.match(/^\/t\/([^/]+)\/?$/);
  if (tripMatch) return { name: 'trip', tripId: decodeURIComponent(tripMatch[1]) };
  return { name: 'home' };
}

function render() {
  const route = parseRoute();
  let trip = null;
  try {
    trip = route.tripId ? store.getTrip(route.tripId) : null;
    if (route.name === 'settle' && trip) document.title = `结算 · ${trip.title}`;
    else if (trip) document.title = `${trip.title} · 出游记账`;
    else document.title = '出游记账';

    root.innerHTML = `
      <div class="app">
        ${renderBanner()}
        ${renderView(route, trip)}
        ${renderFooter()}
        ${renderDialog(trip)}
      </div>
    `;
    const form = root.querySelector('form[data-form="expense"]');
    if (form && trip) updateExpensePreview(form, trip);
  } catch (error) {
    root.innerHTML = `
      <main class="wrap">
        <section class="card empty">
          <h1>读不到这台浏览器里的账</h1>
          <p>${esc(error.message || '本地存储不可用')}</p>
        </section>
      </main>
    `;
  }
}

function renderView(route, trip) {
  if (route.name === 'home') return renderHome();
  if (!trip) {
    return `
      <main class="wrap">
        <section class="card empty">
          <h1>这本账不在这台浏览器里</h1>
          <p>账只存在记账时用的那台浏览器。换设备或清过数据之后，用备份 JSON 导入。</p>
          <a class="button" href="#/">回账本列表</a>
        </section>
      </main>
    `;
  }
  if (route.name === 'settle') return renderSettlement(trip);
  return renderTrip(trip);
}

function renderHome() {
  const trips = store.listTrips();
  const cards = trips.length
    ? trips.map((trip) => `
        <a class="trip-card" href="#/t/${encodeURIComponent(trip.id)}">
          <span>
            <h2>${esc(trip.title)}</h2>
            <p>${trip.members.length} 位成员 · ${trip.entries.length} 笔账</p>
          </span>
          <span class="trip-card-time">
            更新于
            <time datetime="${esc(trip.updatedAt)}">${esc(formatTime(trip.updatedAt))}</time>
          </span>
        </a>
      `).join('')
    : '<p class="muted">还没有账本。写一个行程标题，从第一笔记起。</p>';

  return `
    <main class="wrap narrow" id="home">
      <header class="mast">
        <div class="seal" aria-hidden="true">记</div>
        <div>
          <p class="eyebrow">人民币 · 只在这台浏览器</p>
          <h1>出游记账</h1>
          <p class="lede">一个行程标题就是一本账。谁垫了、谁参与，勾上的人均分。朋友要一起看，就用这台设备打开。</p>
        </div>
      </header>

      <section class="card">
        <h2>新建账本</h2>
        <form data-form="create">
          <label class="field">
            <span>行程标题</span>
            <input name="title" maxlength="40" placeholder="例如：杭州周末" autocomplete="off" />
          </label>
          <button class="button" type="submit">建立账本</button>
        </form>
      </section>

      <section class="card" id="ledger-list">
        <h2>已有账本</h2>
        <div class="trip-list">${cards}</div>
      </section>

      <section class="card">
        <h2>备份</h2>
        <p class="muted">换浏览器或清除数据前，把账导出成 JSON。导入会覆盖这台浏览器里的全部账本。</p>
        <div class="row">
          <button class="button secondary" type="button" data-action="export">导出备份</button>
          <label class="button secondary file-button">
            导入备份
            <input id="import-file" type="file" accept="application/json,.json" />
          </label>
        </div>
      </section>
    </main>
  `;
}

function renderTrip(trip) {
  const result = settle(trip);
  const entries = [...trip.entries].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const list = entries.length
    ? entries.map((entry) => renderEntry(trip, entry, lineFor(result, entry.id))).join('')
    : '<p class="muted">还没有账。先加成员，再记第一笔。</p>';

  return `
    <main class="wrap" id="trip">
      ${renderTripHead(trip, false)}
      <div class="trip-grid">
        <div class="stack">
          ${renderMembers(trip)}
          ${renderComposer(trip)}
        </div>
        <section class="card" id="entry-list">
          <div class="section-head">
            <h2>明细</h2>
            <a class="text-link" href="#/t/${encodeURIComponent(trip.id)}/settle">看结算</a>
          </div>
          ${list}
        </section>
      </div>
      <p class="center">
        <button type="button" class="text-button danger" data-action="ask-delete-trip">删除这本账</button>
      </p>
    </main>
  `;
}

function renderTripHead(trip, settling) {
  const backHref = settling ? `#/t/${encodeURIComponent(trip.id)}` : '#/';
  const backLabel = settling ? '返回账本' : '全部账本';
  return `
    <header class="trip-head">
      <a class="back" href="${backHref}">${backLabel}</a>
      <div class="trip-title-row">
        <h1>${esc(trip.title)}</h1>
        ${settling ? '' : `<a class="button small" href="#/t/${encodeURIComponent(trip.id)}/settle">结算</a>`}
      </div>
      <p class="times">
        <span>建立于 <time datetime="${esc(trip.createdAt)}">${esc(formatTime(trip.createdAt))}</time></span>
        <span>更新于 <time datetime="${esc(trip.updatedAt)}">${esc(formatTime(trip.updatedAt))}</time></span>
      </p>
    </header>
  `;
}

function renderMembers(trip) {
  const chips = trip.members.length
    ? trip.members.map((member) => `
        <span class="chip">
          <span>${esc(member.nickname)}</span>
          <button type="button" data-action="ask-remove-member" data-id="${esc(member.id)}" aria-label="去掉${esc(member.nickname)}">×</button>
        </span>
      `).join('')
    : '<span class="muted">还没有成员</span>';

  return `
    <section class="card">
      <h2>成员</h2>
      <p class="muted">不在场的人也可以加昵称，用来代记。</p>
      <div class="chips">${chips}</div>
      <form data-form="member" class="inline-form">
        <label class="field grow">
          <span class="sr-only">昵称</span>
          <input name="nickname" maxlength="16" placeholder="昵称，例如：我、王、李" autocomplete="off" />
        </label>
        <button class="button secondary" type="submit">添加</button>
      </form>
    </section>
  `;
}

function renderComposer(trip) {
  const expenseOn = ui.tab !== 'prepaid';
  return `
    <section class="card" id="composer">
      <h2>记一笔</h2>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-action="tab" data-tab="expense" aria-selected="${expenseOn}" class="${expenseOn ? 'on' : ''}">费用</button>
        <button type="button" role="tab" data-action="tab" data-tab="prepaid" aria-selected="${!expenseOn}" class="${expenseOn ? '' : 'on'}">预收/预缴</button>
      </div>
      ${expenseOn ? renderExpenseForm(trip) : renderPrepaidForm(trip)}
    </section>
  `;
}

function memberOptions(trip, selectedIndex = 0) {
  return trip.members.map((member, index) => `
    <option value="${esc(member.id)}"${index === selectedIndex ? ' selected' : ''}>${esc(member.nickname)}</option>
  `).join('');
}

function renderExpenseForm(trip) {
  if (trip.members.length === 0) {
    return '<p class="muted">先添加成员，才能记费用。</p>';
  }
  const checks = trip.members.map((member) => `
    <label class="check">
      <input type="checkbox" name="participants" value="${esc(member.id)}" checked />
      <span>${esc(member.nickname)}</span>
    </label>
  `).join('');

  return `
    <form data-form="expense">
      <label class="field">
        <span>金额</span>
        <span class="money-field">
          <span class="yen" aria-hidden="true">¥</span>
          <input name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off" />
        </span>
        <small>只记人民币</small>
      </label>
      <label class="field">
        <span>说明</span>
        <input name="note" maxlength="40" placeholder="午饭、门票、打车" autocomplete="off" />
      </label>
      <label class="field">
        <span>谁付的</span>
        <select name="payer">${memberOptions(trip, 0)}</select>
      </label>
      <fieldset>
        <legend>谁参与，只分给勾选的人</legend>
        <div class="checks">${checks}</div>
      </fieldset>
      <p class="preview" id="split-preview"></p>
      <button class="button" type="submit">保存这笔费用</button>
    </form>
  `;
}

function renderPrepaidForm(trip) {
  if (trip.members.length < 2) {
    return '<p class="muted">预缴要有两个人：一个交钱，一个收钱。不记预缴也可以，结算只按费用算。</p>';
  }
  const receiverIndex = trip.members.length > 1 ? 1 : 0;
  return `
    <form data-form="prepaid">
      <p class="muted">某人提前把钱交给另一位。不计入总支出。不记也可以，结算只按费用算。</p>
      <label class="field">
        <span>金额</span>
        <span class="money-field">
          <span class="yen" aria-hidden="true">¥</span>
          <input name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off" />
        </span>
      </label>
      <label class="field">
        <span>说明</span>
        <input name="note" maxlength="40" placeholder="出发前转的" autocomplete="off" />
      </label>
      <label class="field">
        <span>谁预缴</span>
        <select name="from">${memberOptions(trip, 0)}</select>
      </label>
      <label class="field">
        <span>交给谁</span>
        <select name="to">${memberOptions(trip, receiverIndex)}</select>
      </label>
      <button class="button" type="submit">保存这笔预缴</button>
    </form>
  `;
}

function renderEntry(trip, entry, line) {
  const when = `
    <p class="times">
      <span>创建于 <time datetime="${esc(entry.createdAt || '')}">${esc(formatTime(entry.createdAt))}</time></span>
      <span>更新于 <time datetime="${esc(entry.updatedAt || '')}">${esc(formatTime(entry.updatedAt))}</time></span>
    </p>
  `;
  const remove = `<button type="button" class="text-button" data-action="ask-delete-entry" data-id="${esc(entry.id)}">删除这笔</button>`;

  if (entry.kind === 'prepaid') {
    return `
      <article class="entry" data-kind="prepaid">
        <div class="entry-top">
          <div>
            <p class="kind">预收/预缴</p>
            <h3>${esc(entry.note || '未备注')}</h3>
          </div>
          <strong class="amount">${formatCny(entry.amountCents)}</strong>
        </div>
        <p>${esc(nameOf(trip, entry.prepaidMemberId))} 预缴，交给 ${esc(nameOf(trip, entry.receiverMemberId))}。这笔不进总支出。</p>
        ${when}
        ${remove}
      </article>
    `;
  }

  const parts = (line?.participants || []).map((id) => `${nameOf(trip, id)} ${formatCny(line.shareMap[id])}`);
  const skipped = trip.members
    .filter((member) => !(entry.participantMemberIds || []).includes(member.id))
    .map((member) => member.nickname);
  const odd = line && new Set(Object.values(line.shareMap)).size > 1;

  return `
    <article class="entry" data-kind="expense">
      <div class="entry-top">
        <div>
          <p class="kind">费用</p>
          <h3>${esc(entry.note || '未备注')}</h3>
        </div>
        <strong class="amount">${formatCny(entry.amountCents)}</strong>
      </div>
      <p>付款人 ${esc(nameOf(trip, entry.payerMemberId))} 付了 ${formatCny(entry.amountCents)}</p>
      <p>分摊：${parts.length ? esc(parts.join('、')) : '没有参与人'}</p>
      <p>${skipped.length ? `未参与：${esc(skipped.join('、'))}` : '全员参与'}</p>
      ${odd ? '<p class="muted">有 1 分钱零头，分给了成员里更靠前的人。</p>' : ''}
      ${when}
      ${remove}
    </article>
  `;
}

function renderSettlement(trip) {
  const result = settle(trip);
  const ordered = [...result.lines].sort((a, b) => String(a.entry.createdAt).localeCompare(String(b.entry.createdAt)));
  const people = result.people.map((person) => {
    const label = person.net > 0 ? '应收' : person.net < 0 ? '应付' : '已平';
    const tone = person.net > 0 ? 'in' : person.net < 0 ? 'out' : 'even';
    const prepaidBits = result.totalPrepaid > 0
      ? `<li>预缴交出 ${formatCny(person.prepaidOut)}</li><li>收到预缴 ${formatCny(person.prepaidIn)}</li>`
      : '';
    return `
      <article class="person ${tone}">
        <div class="entry-top">
          <h3>${esc(person.member.nickname)}</h3>
          <p class="net"><span>${label}</span> <strong>${formatCny(Math.abs(person.net))}</strong></p>
        </div>
        <ul>
          <li>垫付费用 ${formatCny(person.paid)}</li>
          <li>应摊 ${formatCny(person.share)}</li>
          ${prepaidBits}
        </ul>
      </article>
    `;
  }).join('');

  const prepaidNote = result.totalPrepaid > 0
    ? `另有预缴 ${formatCny(result.totalPrepaid)}，不计入总支出。`
    : '没有预缴。下面的净额只按费用计算。';

  return `
    <main class="wrap" id="settlement">
      ${renderTripHead(trip, true)}
      <section class="card total-card">
        <p class="eyebrow">总支出</p>
        <p class="total">${formatCny(result.totalSpend)}</p>
        <p class="muted">${prepaidNote}</p>
      </section>
      <section class="card">
        <h2>每人净额</h2>
        <p class="muted">应收是别人该给你的，应付是你还该付出的。只记费用、不记预缴时，净额只由费用算出。</p>
        <div class="people">${people || '<p class="muted">还没有成员</p>'}</div>
      </section>
      <section class="card" id="settle-lines">
        <h2>按笔明细</h2>
        ${ordered.length
          ? ordered.map((line) => renderEntry(trip, line.entry, line)).join('')
          : '<p class="muted">还没有账，净额都是已平。</p>'}
      </section>
    </main>
  `;
}

function renderFooter() {
  return `
    <footer class="site-footer">
      <p>免费使用。没有账号，也不经过支付。</p>
      <p>小红书搜「珊哥爱读书」</p>
    </footer>
  `;
}

function renderBanner() {
  if (!ui.banner) return '';
  const role = ui.banner.type === 'error' ? 'alert' : 'status';
  const tone = ui.banner.type === 'error' ? 'bad' : 'good';
  return `<div class="banner ${tone}" role="${role}">${esc(ui.banner.text)}</div>`;
}

function renderDialog(trip) {
  if (!ui.confirm) return '';
  const copy = {
    trip: `删除账本「${trip?.title || ''}」？这台浏览器里的成员和账都会消失。`,
    entry: '删掉这笔账？',
    member: `去掉昵称「${ui.confirm.nickname || ''}」？`,
    import: '用备份覆盖这台浏览器里的全部账本？现在的账会被换掉。',
  }[ui.confirm.type] || '确认？';
  const ok = ui.confirm.type === 'import' ? '覆盖导入' : '删除';
  return `
    <div class="modal-back">
      <div class="modal" role="dialog" aria-modal="true" aria-label="确认">
        <p>${esc(copy)}</p>
        <div class="row">
          <button type="button" class="button secondary" data-action="cancel-confirm">取消</button>
          <button type="button" class="button danger" data-action="confirm-yes">${ok}</button>
        </div>
      </div>
    </div>
  `;
}

function nameOf(trip, id) {
  return trip.members.find((member) => member.id === id)?.nickname || '未知';
}

function showBanner(banner) {
  ui.banner = banner;
  let node = root.querySelector('.banner');
  if (!node) {
    node = document.createElement('div');
    root.querySelector('.app')?.prepend(node);
  }
  node.className = `banner ${banner.type === 'error' ? 'bad' : 'good'}`;
  node.setAttribute('role', banner.type === 'error' ? 'alert' : 'status');
  node.textContent = banner.text;
  node.scrollIntoView({ block: 'nearest' });
}

function updateExpensePreview(form, trip) {
  const node = form.querySelector('#split-preview');
  if (!node) return;
  const amountRaw = form.amount.value.trim();
  const checked = new Set(
    [...form.querySelectorAll('input[name="participants"]:checked')].map((input) => input.value),
  );
  if (!amountRaw) {
    node.textContent = '填写金额并勾选参与人后，这里会显示每人分摊。';
    return;
  }
  let cents;
  try {
    cents = parseYuan(amountRaw);
  } catch (error) {
    node.textContent = error.message;
    return;
  }
  const ordered = trip.members.filter((member) => checked.has(member.id));
  if (ordered.length === 0) {
    node.textContent = '还没有勾选参与人。未勾选的人不分摊。';
    return;
  }
  const shares = splitCents(cents, ordered.length);
  const parts = ordered.map((member, index) => `${member.nickname} ${formatCny(shares[index])}`);
  const skipped = trip.members.filter((member) => !checked.has(member.id)).map((member) => member.nickname);
  const skipText = skipped.length ? `未参与：${skipped.join('、')}` : '全员参与';
  node.textContent = `均分：${parts.join('、')}。${skipText}。`;
}

function go(path, banner) {
  ui.banner = banner || null;
  ui.confirm = null;
  keepBanner = Boolean(banner);
  const next = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === next) {
    keepBanner = false;
    render();
    return;
  }
  location.hash = next;
}

function onClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || !root.contains(button)) return;
  const action = button.dataset.action;
  const route = parseRoute();

  if (action === 'tab') {
    ui.tab = button.dataset.tab === 'prepaid' ? 'prepaid' : 'expense';
    render();
    return;
  }

  if (action === 'export') {
    const json = store.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `travel-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    ui.banner = { type: 'ok', text: '备份已开始下载' };
    render();
    return;
  }

  if (action === 'cancel-confirm') {
    ui.confirm = null;
    ui.pendingImport = null;
    render();
    return;
  }

  if (action === 'ask-delete-trip') {
    ui.confirm = { type: 'trip', tripId: route.tripId };
    render();
    return;
  }

  if (action === 'ask-delete-entry') {
    ui.confirm = { type: 'entry', tripId: route.tripId, entryId: button.dataset.id };
    render();
    return;
  }

  if (action === 'ask-remove-member') {
    const trip = store.getTrip(route.tripId);
    const member = trip?.members.find((item) => item.id === button.dataset.id);
    ui.confirm = {
      type: 'member',
      tripId: route.tripId,
      memberId: button.dataset.id,
      nickname: member?.nickname || '',
    };
    render();
    return;
  }

  if (action === 'confirm-yes') {
    const confirm = ui.confirm;
    if (!confirm) return;
    try {
      if (confirm.type === 'trip') {
        store.deleteTrip(confirm.tripId);
        ui.confirm = null;
        go('/', { type: 'ok', text: '账本已删除' });
        return;
      }
      if (confirm.type === 'entry') store.deleteEntry(confirm.tripId, confirm.entryId);
      if (confirm.type === 'member') store.removeMember(confirm.tripId, confirm.memberId);
      if (confirm.type === 'import') {
        store.importJson(ui.pendingImport || '');
        ui.pendingImport = null;
      }
      ui.confirm = null;
      ui.banner = {
        type: 'ok',
        text: confirm.type === 'import' ? '备份已导入' : '已删除',
      };
    } catch (error) {
      ui.confirm = null;
      ui.banner = { type: 'error', text: error.message || '没有完成' };
    }
    render();
  }
}

function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const route = parseRoute();
  try {
    if (form.dataset.form === 'create') {
      const trip = store.createTrip(form.title.value);
      go(`/t/${trip.id}`, { type: 'ok', text: '账本已建立' });
      return;
    }
    if (form.dataset.form === 'member') {
      store.addMember(route.tripId, form.nickname.value);
      ui.banner = { type: 'ok', text: '成员已加上' };
      render();
      return;
    }
    if (form.dataset.form === 'expense') {
      const checked = [...form.querySelectorAll('input[name="participants"]:checked')].map((input) => input.value);
      store.addExpense(route.tripId, {
        amountCents: parseYuan(form.amount.value),
        note: form.note.value,
        payerMemberId: form.payer.value,
        participantMemberIds: checked,
      });
      ui.banner = { type: 'ok', text: '费用已记下' };
      render();
      return;
    }
    if (form.dataset.form === 'prepaid') {
      store.addPrepaid(route.tripId, {
        amountCents: parseYuan(form.amount.value),
        note: form.note.value,
        prepaidMemberId: form.from.value,
        receiverMemberId: form.to.value,
      });
      ui.banner = { type: 'ok', text: '预缴已记下' };
      render();
    }
  } catch (error) {
    showBanner({ type: 'error', text: error.message || '没有完成' });
  }
}

function onField(event) {
  if (ui.banner?.type === 'ok' && event.target?.id !== 'import-file') {
    ui.banner = null;
    root.querySelector('.banner')?.remove();
  }

  if (event.target?.id === 'import-file') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      ui.pendingImport = String(reader.result || '');
      ui.confirm = { type: 'import' };
      render();
    };
    reader.onerror = () => {
      showBanner({ type: 'error', text: '没有读到这个文件' });
    };
    reader.readAsText(file);
    return;
  }

  const form = event.target.closest?.('form[data-form="expense"]');
  if (!form) return;
  const trip = store.getTrip(parseRoute().tripId);
  if (trip) updateExpensePreview(form, trip);
}
