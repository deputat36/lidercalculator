import { supabaseClient } from './supabase-client.js';
import { openLeadRoute } from './router.js';

const MENU_SECTIONS = [
  { key: 'leads', label: 'Заявки', id: 'leadsSection' },
  { key: 'orders', label: 'Заказы', id: 'ordersListSection', title: 'Заказы', description: 'Общий список заказов. Здесь видно, что находится в работе, что просрочено, что готово и что требует внимания.' },
  { key: 'clients', label: 'Клиенты', id: 'clientsSection', title: 'Клиенты', description: 'Список клиентов собирается из заявок: имя, телефон, город, источник и последняя активность.' },
  { key: 'calculations', label: 'Расчёты', id: 'calculationsListSection', title: 'Расчёты', description: 'Все сохранённые расчёты: сумма клиенту, прибыль, статус и связь с заявкой.' },
  { key: 'offers', label: 'КП', id: 'offersListSection', title: 'Коммерческие предложения', description: 'Все КП: черновики, отправленные, согласованные и отклонённые.' },
  { key: 'catalog', label: 'Номенклатура', id: 'catalogSection' },
  { key: 'settings', label: 'Настройки', id: 'settingsSection', title: 'Настройки', description: 'Здесь будут настройки компании, печатного КП, доступов, статусов и шаблонов.' }
];

const INTERNAL_SECTIONS = [
  { key: 'card', id: 'leadCardSection' },
  { key: 'orderCard', id: 'orderCardSection' }
];

let currentTab = 'leads';
let ordersLoaded = false;
let clientsLoaded = false;
let calculationsLoaded = false;
let offersLoaded = false;
let renderBusy = false;
let eventsBound = false;
let selectedOrderId = null;
let currentOrder = null;
let orderCardBusy = false;
let orderCardError = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function dateRu(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function dateTimeRu(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function asData(order) {
  if (!order) return {};
  if (order.data && typeof order.data === 'object') return order.data;
  if (typeof order.data === 'string') {
    try { return JSON.parse(order.data); } catch (_) { return {}; }
  }
  return {};
}

function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('соглас') || text.includes('готов') || text.includes('создан') || text.includes('выдан') || text.includes('закры')) return 'is-good';
  if (text.includes('отказ') || text.includes('спам') || text.includes('отмен') || text.includes('проблем')) return 'is-danger';
  if (text.includes('жд') || text.includes('уточ') || text.includes('работ') || text.includes('отправ') || text.includes('производ')) return 'is-warn';
  return '';
}

function layoutStatus(order) {
  const data = asData(order);
  return order?.layout_status || data.layout_status || data.layoutStatus || 'Макета нет';
}

function orderType(order) {
  const data = asData(order);
  return order?.order_type || data.order_type || data.orderType || '—';
}

function orderLeadId(order) {
  const data = asData(order);
  return order?.lead_id || data.lead_id || data.leadId || null;
}

function extractOrderRows(order) {
  const data = asData(order);
  const candidates = [order?.rows, order?.items, data.rows, data.items, data.order_rows, data.orderItems];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

function isDeadlineOverdue(order) {
  if (!order?.deadline) return false;
  const deadline = new Date(order.deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  deadline.setHours(23, 59, 59, 999);
  return deadline < new Date() && !['Готово', 'Выдано', 'Закрыт', 'Отменён'].includes(order.status || '');
}

function orderChecklistItems(order) {
  const status = order?.status || 'Новый';
  const pay = order?.payment_status || 'Не оплачено';
  const layout = layoutStatus(order);
  const hasDeadline = Boolean(order?.deadline);
  const overdue = isDeadlineOverdue(order);
  const paid = !['Не оплачено', 'Нет оплаты', 'Ожидается', ''].includes(pay);
  const layoutDone = ['Согласован', 'Макет согласован', 'Готов'].includes(layout);
  const productionStarted = ['В производстве', 'Готово', 'Выдано', 'Закрыт'].includes(status);
  const ready = ['Готово', 'Выдано', 'Закрыт'].includes(status);
  const issued = ['Выдано', 'Закрыт'].includes(status);
  return [
    { title: 'Заказ создан', text: status, done: true },
    { title: 'Макет', text: layout, done: layoutDone, warn: !layoutDone },
    { title: 'Оплата', text: pay, done: paid, warn: !paid },
    { title: 'Срок', text: hasDeadline ? dateRu(order.deadline) : 'Срок не указан', done: hasDeadline && !overdue, danger: overdue, warn: !hasDeadline },
    { title: 'Производство', text: productionStarted ? status : 'Ещё не в производстве', done: productionStarted, warn: !productionStarted },
    { title: 'Готовность', text: ready ? status : 'Не готово', done: ready, warn: !ready },
    { title: 'Выдача клиенту', text: issued ? status : 'Не выдано', done: issued, warn: !issued }
  ];
}

function injectStyles() {
  if (document.getElementById('v4WorkspaceMenuStyles')) return;
  const style = document.createElement('style');
  style.id = 'v4WorkspaceMenuStyles';
  style.textContent = `
    [data-v4-managed-section][hidden]{display:none!important}
    .v4-layout-tabs{gap:7px!important}.v4-layout-tabs button{white-space:nowrap}
    .v4-crm-list{display:grid;gap:12px;margin-top:12px}
    .v4-crm-list-card,.v4-order-detail-panel{border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:14px;box-shadow:0 10px 24px rgba(15,23,42,.05)}
    .v4-crm-list-head,.v4-order-detail-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .v4-crm-list-head h3,.v4-order-detail-head h2{margin:0;overflow-wrap:anywhere}.v4-order-detail-head p{margin:6px 0 0;color:#64748b}
    .v4-crm-badge{display:inline-flex;align-items:center;border-radius:999px;background:#e0f2fe;color:#075985;padding:5px 8px;font-size:12px;font-weight:900;white-space:nowrap}
    .v4-crm-badge.is-good{background:#dcfce7;color:#166534}.v4-crm-badge.is-warn{background:#fef3c7;color:#92400e}.v4-crm-badge.is-danger{background:#fee2e2;color:#991b1b}
    .v4-crm-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.v4-crm-meta span{border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#334155;padding:6px 9px;font-size:13px}
    .v4-crm-actions,.v4-order-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.v4-order-detail-actions{margin-top:0;justify-content:flex-end}
    .v4-crm-summary,.v4-order-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;margin:12px 0}.v4-crm-summary div,.v4-order-detail-grid div{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:12px}.v4-crm-summary span,.v4-order-detail-grid span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:900}.v4-crm-summary b,.v4-order-detail-grid b{display:block;margin-top:5px;font-size:18px;overflow-wrap:anywhere}
    .v4-section-placeholder{border:1px dashed #cbd5e1;border-radius:18px;background:#f8fafc;padding:18px;color:#475569}
    .v4-order-progress{border:1px solid #dbeafe;border-radius:16px;background:#fff;padding:12px;margin-top:12px}.v4-order-progress-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;font-weight:900}.v4-order-progress-bar{height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden}.v4-order-progress-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#2563eb,#22c55e)}.v4-order-checklist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:8px;margin-top:12px}.v4-order-check{border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:10px}.v4-order-check b{display:block}.v4-order-check span{display:block;margin-top:4px;color:#64748b;font-size:12px}.v4-order-check.is-done{border-color:#bbf7d0;background:#f0fdf4}.v4-order-check.is-done b{color:#166534}.v4-order-check.is-warn{border-color:#fde68a;background:#fffbeb}.v4-order-check.is-danger{border-color:#fecaca;background:#fef2f2}.v4-order-check.is-danger b{color:#991b1b}
    .v4-order-rows-table-wrap{overflow:auto;margin-top:12px}.v4-order-rows-table{width:100%;min-width:720px;border-collapse:collapse;font-size:13px}.v4-order-rows-table th{background:#0f172a;color:#fff;text-align:left;padding:9px}.v4-order-rows-table td{border:1px solid #e2e8f0;padding:9px;vertical-align:top}.v4-order-rows-table tr:nth-child(even) td{background:#f8fafc}.v4-order-comment{white-space:pre-wrap;color:#334155}
    @media(max-width:720px){.v4-crm-list-head,.v4-order-detail-head{display:grid;grid-template-columns:1fr}.v4-order-detail-actions{justify-content:stretch}.v4-layout-tabs button{flex:1 1 calc(50% - 8px)}}
  `;
  document.head.appendChild(style);
}

function workspace() {
  return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body;
}

function createGenericSection(section) {
  if (document.getElementById(section.id)) return document.getElementById(section.id);
  const el = document.createElement('section');
  el.id = section.id;
  el.className = 'v4-card v4-managed-section';
  el.dataset.v4ManagedSection = section.key;
  el.innerHTML = `
    <div class="v4-section-head">
      <div><h2>${esc(section.title || section.label)}</h2><p>${esc(section.description || '')}</p></div>
      <button type="button" class="v4-primary" data-v4-list-refresh="${esc(section.key)}">Обновить</button>
    </div>
    <div id="${esc(section.id)}Content" class="v4-crm-list"><div class="v4-empty">Раздел загружается...</div></div>
  `;
  const anchor = document.getElementById('catalogSection') || document.getElementById('leadsSection') || workspace().lastElementChild;
  if (anchor && anchor.parentNode) anchor.insertAdjacentElement('afterend', el);
  else workspace().appendChild(el);
  return el;
}

function createSettingsSection() {
  if (document.getElementById('settingsSection')) return document.getElementById('settingsSection');
  const el = document.createElement('section');
  el.id = 'settingsSection';
  el.className = 'v4-card v4-managed-section';
  el.dataset.v4ManagedSection = 'settings';
  el.innerHTML = '<div class="v4-section-head"><div><h2>Настройки</h2><p>Здесь будут настройки компании, шаблонов КП, доступов, статусов и справочников.</p></div></div><div class="v4-section-placeholder"><b>Раздел подготовлен.</b><br>Следующим шагом сюда можно перенести настройки печатного КП, реквизиты компании и шаблоны стандартных условий.</div>';
  workspace().appendChild(el);
  return el;
}

function createOrderCardSection() {
  if (document.getElementById('orderCardSection')) return document.getElementById('orderCardSection');
  const el = document.createElement('section');
  el.id = 'orderCardSection';
  el.className = 'v4-card v4-managed-section';
  el.dataset.v4ManagedSection = 'orderCard';
  el.innerHTML = '<div id="orderCardContent"><div class="v4-empty">Выберите заказ из списка заказов.</div></div>';
  const ordersSection = document.getElementById('ordersListSection') || document.getElementById('catalogSection') || workspace().lastElementChild;
  if (ordersSection && ordersSection.parentNode) ordersSection.insertAdjacentElement('afterend', el);
  else workspace().appendChild(el);
  return el;
}

function ensureSections() {
  MENU_SECTIONS.forEach((section) => {
    if (['leads', 'catalog'].includes(section.key)) {
      const el = document.getElementById(section.id);
      if (el) el.dataset.v4ManagedSection = section.key;
      return;
    }
    if (section.key === 'settings') createSettingsSection();
    else createGenericSection(section);
  });
  createOrderCardSection();
  INTERNAL_SECTIONS.forEach((section) => {
    const el = document.getElementById(section.id);
    if (el) el.dataset.v4ManagedSection = section.key;
  });
  document.querySelectorAll('.v4-next-card').forEach((el) => { el.dataset.v4ManagedSection = 'help'; });
}

function ensureMenu() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav) return;
  nav.innerHTML = '<b>Главное меню</b>' + MENU_SECTIONS.map((section) => `<button type="button" data-v4-tab-button="${esc(section.key)}">${esc(section.label)}</button>`).join('');
}

function setActiveTab(tab, options = {}) {
  const allowed = new Set(MENU_SECTIONS.map((section) => section.key).concat(['card', 'orderCard', 'help']));
  currentTab = allowed.has(tab) ? tab : 'leads';
  document.body.dataset.v4Tab = currentTab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((btn) => { btn.classList.toggle('is-active', btn.dataset.v4TabButton === currentTab); });
  document.querySelectorAll('[data-v4-managed-section]').forEach((el) => { el.hidden = el.dataset.v4ManagedSection !== currentTab; });
  if (!options.noLoad) loadCurrentList(currentTab);
}

function setContent(sectionId, html) {
  const box = document.getElementById(`${sectionId}Content`);
  if (box) box.innerHTML = html;
}

function summary(items) {
  return `<div class="v4-crm-summary">${items.map((item) => `<div><span>${esc(item.label)}</span><b>${esc(item.value)}</b></div>`).join('')}</div>`;
}

function renderOrderChecklist(order) {
  const items = orderChecklistItems(order);
  const done = items.filter((item) => item.done).length;
  const percent = Math.round((done / items.length) * 100);
  return `
    <div class="v4-order-progress">
      <div class="v4-order-progress-head"><span>Готовность заказа</span><b>${percent}%</b></div>
      <div class="v4-order-progress-bar"><span style="width:${percent}%"></span></div>
      <div class="v4-order-checklist">
        ${items.map((item) => {
          const cls = item.done ? 'is-done' : item.danger ? 'is-danger' : item.warn ? 'is-warn' : '';
          return `<div class="v4-order-check ${cls}"><b>${item.done ? '✓ ' : item.danger ? '! ' : '• '}${esc(item.title)}</b><span>${esc(item.text)}</span></div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderRowsTable(order) {
  const rows = extractOrderRows(order);
  if (!rows.length) return '<div class="v4-empty">Позиции заказа пока не найдены в данных заказа. Состав можно посмотреть через связанный расчёт или КП.</div>';
  return `
    <div class="v4-order-rows-table-wrap">
      <table class="v4-order-rows-table">
        <thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th>Комментарий</th></tr></thead>
        <tbody>${rows.map((row, index) => {
          const qty = row.qty || row.quantity || row.count || '';
          const price = row.client_price || row.price || row.clientPrice || 0;
          const sum = row.client_sum || row.clientSum || row.sum || 0;
          return `<tr><td>${index + 1}</td><td><b>${esc(row.name || row.title || 'Позиция')}</b></td><td>${esc(qty)} ${esc(row.unit || '')}</td><td>${money(price)}</td><td><b>${money(sum)}</b></td><td>${esc(row.comment || row.note || '')}</td></tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderOrderCardScreen() {
  const host = document.getElementById('orderCardContent');
  if (!host) return;
  if (orderCardBusy) {
    host.innerHTML = '<div class="v4-empty">Загружаю карточку заказа...</div>';
    return;
  }
  if (orderCardError) {
    host.innerHTML = `<div class="v4-empty is-error">${esc(orderCardError)}</div>`;
    return;
  }
  if (!currentOrder) {
    host.innerHTML = '<div class="v4-empty">Выберите заказ из списка заказов.</div>';
    return;
  }
  const order = currentOrder;
  const leadId = orderLeadId(order);
  const data = asData(order);
  host.innerHTML = `
    <div class="v4-order-detail-panel">
      <div class="v4-order-detail-head">
        <div>
          <p class="v4-kicker">Карточка заказа</p>
          <h2>№${esc(order.order_number || String(order.id || '').slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h2>
          <p>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</p>
        </div>
        <div class="v4-order-detail-actions">
          <button type="button" data-back-to-orders>Назад к заказам</button>
          ${leadId ? `<button type="button" data-open-order-lead="${esc(leadId)}">Открыть заявку</button>` : ''}
          <button type="button" class="v4-primary" data-print-order-task>Печать задания</button>
        </div>
      </div>
      <div class="v4-order-detail-grid">
        <div><span>Статус</span><b>${esc(order.status || 'Новый')}</b></div>
        <div><span>Тип</span><b>${esc(orderType(order))}</b></div>
        <div><span>Срок</span><b>${dateRu(order.deadline)}</b></div>
        <div><span>Макет</span><b>${esc(layoutStatus(order))}</b></div>
        <div><span>Клиенту</span><b>${money(order.client_total)}</b></div>
        <div><span>Себестоимость</span><b>${money(order.contractor_cost)}</b></div>
        <div><span>Прибыль</span><b>${money(order.profit)}</b></div>
        <div><span>Оплата</span><b>${esc(order.payment_status || 'Не оплачено')}</b></div>
      </div>
      ${renderOrderChecklist(order)}
      <section class="v4-order-detail-panel" style="margin-top:12px">
        <h3>Состав заказа</h3>
        ${renderRowsTable(order)}
      </section>
      <section class="v4-order-detail-panel" style="margin-top:12px">
        <h3>Комментарий и производственные условия</h3>
        <div class="v4-order-comment">${esc(order.comment || data.comment || data.production_comment || 'Комментарий не заполнен.')}</div>
      </section>
    </div>
  `;
}

async function openOrderCard(orderId) {
  selectedOrderId = orderId;
  currentOrder = null;
  orderCardError = '';
  orderCardBusy = true;
  setActiveTab('orderCard', { noLoad: true });
  renderOrderCardScreen();
  try {
    const response = await supabaseClient.from('leader_orders').select('*').eq('id', orderId).maybeSingle();
    if (response.error) throw response.error;
    if (!response.data) throw new Error('Заказ не найден');
    currentOrder = response.data;
  } catch (error) {
    orderCardError = error.message || String(error);
  } finally {
    orderCardBusy = false;
    renderOrderCardScreen();
  }
}

function printTaskHtml(order) {
  const rows = extractOrderRows(order);
  const data = asData(order);
  const rowsHtml = rows.length ? rows.map((row, index) => {
    const qty = row.qty || row.quantity || row.count || '';
    return `<tr><td>${index + 1}</td><td>${esc(row.name || row.title || 'Позиция')}</td><td>${esc(qty)} ${esc(row.unit || '')}</td><td>${esc(row.comment || row.note || '')}</td></tr>`;
  }).join('') : '<tr><td colspan="4">Позиции не найдены в данных заказа. Проверьте связанный расчёт / КП.</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Задание в производство</title><style>body{font-family:Arial,sans-serif;margin:0;background:#e5e7eb;color:#0f172a}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1d4ed8;padding-bottom:12px}.top h1{margin:0}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}.meta div{border:1px solid #dbe3ef;border-radius:12px;padding:10px}.meta span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:900}.meta b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#0f172a;color:#fff;text-align:left;padding:9px}td{border:1px solid #dbe3ef;padding:9px;vertical-align:top}.note{border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:12px;margin-top:14px;white-space:pre-wrap}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.sign div{border-top:1px solid #0f172a;padding-top:6px;color:#64748b}.actions{position:fixed;right:16px;top:16px;display:flex;gap:8px}.actions button{border:0;border-radius:999px;background:#1d4ed8;color:#fff;padding:10px 14px;font-weight:900}.actions .dark{background:#0f172a}@page{size:A4;margin:0}@media print{body{background:#fff}.actions{display:none}.page{margin:0}}</style></head><body><div class="actions"><button onclick="window.print()">Печать / PDF</button><button class="dark" onclick="window.close()">Закрыть</button></div><main class="page"><header class="top"><div><h1>Задание в производство</h1><p>РА «Лидер»</p></div><div><b>№${esc(order.order_number || String(order.id || '').slice(0, 8))}</b><br>${dateRu(new Date())}</div></header><section class="meta"><div><span>Заказ</span><b>${esc(order.project_name || 'Заказ')}</b></div><div><span>Клиент</span><b>${esc(order.client_name || '—')}</b></div><div><span>Телефон</span><b>${esc(order.client_phone || '—')}</b></div><div><span>Срок</span><b>${dateRu(order.deadline)}</b></div><div><span>Статус макета</span><b>${esc(layoutStatus(order))}</b></div><div><span>Тип</span><b>${esc(orderType(order))}</b></div></section><h2>Состав работ</h2><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Комментарий</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="note"><b>Комментарий:</b><br>${esc(order.comment || data.comment || data.production_comment || '—')}</div><section class="sign"><div>Передал в производство</div><div>Принял / выполнил</div></section></main></body></html>`;
}

function openProductionPrint() {
  if (!currentOrder) return;
  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) return;
  win.document.open();
  win.document.write(printTaskHtml(currentOrder));
  win.document.close();
}

async function renderOrdersList(force = false) {
  if (ordersLoaded && !force) return;
  ordersLoaded = true;
  setContent('ordersListSection', '<div class="v4-empty">Загружаю заказы...</div>');
  const response = await supabaseClient
    .from('leader_orders')
    .select('id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status,data')
    .order('created_at', { ascending: false })
    .limit(100);
  if (response.error) throw response.error;
  const rows = response.data || [];
  const active = rows.filter((row) => !['Готово', 'Выдано', 'Закрыт', 'Отменён'].includes(row.status || '')).length;
  const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
  setContent('ordersListSection', `
    ${summary([{ label: 'Всего заказов', value: rows.length }, { label: 'В работе', value: active }, { label: 'Сумма клиенту', value: money(total) }])}
    ${rows.length ? rows.map((order) => `
      <article class="v4-crm-list-card">
        <div class="v4-crm-list-head"><h3>№${esc(order.order_number || String(order.id).slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h3><span class="v4-crm-badge ${statusClass(order.status)}">${esc(order.status || 'Новый')}</span></div>
        <div class="v4-crm-meta"><span><b>Клиент:</b> ${esc(order.client_name || '—')}</span><span><b>Телефон:</b> ${esc(order.client_phone || '—')}</span><span><b>Срок:</b> ${dateRu(order.deadline)}</span><span><b>Оплата:</b> ${esc(order.payment_status || 'Не оплачено')}</span><span><b>Сумма:</b> ${money(order.client_total)}</span></div>
        <div class="v4-crm-actions"><button type="button" class="v4-primary" data-open-order="${esc(order.id)}">Открыть заказ</button></div>
      </article>`).join('') : '<div class="v4-empty">Заказов пока нет.</div>'}
  `);
}

async function renderOffersList(force = false) {
  if (offersLoaded && !force) return;
  offersLoaded = true;
  setContent('offersListSection', '<div class="v4-empty">Загружаю КП...</div>');
  const response = await supabaseClient.from('leader_commercial_offers').select('id,lead_id,calculation_id,title,status,total_sum,valid_until,order_id,created_at').order('created_at', { ascending: false }).limit(100);
  if (response.error) throw response.error;
  const rows = response.data || [];
  const agreed = rows.filter((row) => row.status === 'Согласовано').length;
  const total = rows.reduce((sum, row) => sum + Number(row.total_sum || 0), 0);
  setContent('offersListSection', `${summary([{ label: 'Всего КП', value: rows.length }, { label: 'Согласовано', value: agreed }, { label: 'Сумма КП', value: money(total) }])}${rows.length ? rows.map((offer) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(offer.title || 'Коммерческое предложение')}</h3><span class="v4-crm-badge ${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span></div><div class="v4-crm-meta"><span><b>Сумма:</b> ${money(offer.total_sum)}</span><span><b>Действует до:</b> ${dateRu(offer.valid_until)}</span><span><b>Создано:</b> ${dateTimeRu(offer.created_at)}</span><span><b>Заказ:</b> ${offer.order_id ? 'создан' : 'нет'}</span></div>${offer.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(offer.lead_id)}">Открыть заявку</button></div>` : ''}</article>`).join('') : '<div class="v4-empty">КП пока нет.</div>'}`);
}

async function renderCalculationsList(force = false) {
  if (calculationsLoaded && !force) return;
  calculationsLoaded = true;
  setContent('calculationsListSection', '<div class="v4-empty">Загружаю расчёты...</div>');
  const response = await supabaseClient.from('leader_lead_calculations').select('id,lead_id,title,status,client_total,contractor_cost,profit,margin_percent,order_id,created_at').order('created_at', { ascending: false }).limit(100);
  if (response.error) throw response.error;
  const rows = response.data || [];
  const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
  const profit = rows.reduce((sum, row) => sum + Number(row.profit || 0), 0);
  setContent('calculationsListSection', `${summary([{ label: 'Расчётов', value: rows.length }, { label: 'Сумма клиенту', value: money(total) }, { label: 'Плановая прибыль', value: money(profit) }])}${rows.length ? rows.map((calc) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(calc.title || 'Расчёт')}</h3><span class="v4-crm-badge ${statusClass(calc.status)}">${esc(calc.status || 'Черновик')}</span></div><div class="v4-crm-meta"><span><b>Клиенту:</b> ${money(calc.client_total)}</span><span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span><span><b>Прибыль:</b> ${money(calc.profit)}</span><span><b>Маржа:</b> ${calc.margin_percent ? `${Math.round(Number(calc.margin_percent))}%` : '—'}</span><span><b>Создано:</b> ${dateTimeRu(calc.created_at)}</span></div>${calc.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(calc.lead_id)}">Открыть заявку</button></div>` : ''}</article>`).join('') : '<div class="v4-empty">Расчётов пока нет.</div>'}`);
}

async function renderClientsList(force = false) {
  if (clientsLoaded && !force) return;
  clientsLoaded = true;
  setContent('clientsSection', '<div class="v4-empty">Загружаю клиентов...</div>');
  const response = await supabaseClient.from('leader_leads').select('id,name,phone,city,source,service,status,budget,estimated_amount,created_at,next_contact_at').order('created_at', { ascending: false }).limit(300);
  if (response.error) throw response.error;
  const map = new Map();
  (response.data || []).forEach((lead) => {
    const key = lead.phone || lead.name || lead.id;
    if (!map.has(key)) map.set(key, { ...lead, lead_count: 0, total_budget: 0 });
    const row = map.get(key);
    row.lead_count += 1;
    row.total_budget += Number(lead.budget || lead.estimated_amount || 0);
    if (new Date(lead.created_at) > new Date(row.created_at)) Object.assign(row, { ...lead, lead_count: row.lead_count, total_budget: row.total_budget });
  });
  const rows = [...map.values()];
  setContent('clientsSection', `${summary([{ label: 'Клиентов', value: rows.length }, { label: 'Заявок в базе', value: (response.data || []).length }, { label: 'Сумма бюджетов', value: money(rows.reduce((s, r) => s + r.total_budget, 0)) }])}${rows.length ? rows.map((client) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(client.name || 'Без имени')}</h3><span class="v4-crm-badge">${client.lead_count} заявк.</span></div><div class="v4-crm-meta"><span><b>Телефон:</b> ${esc(client.phone || '—')}</span><span><b>Город:</b> ${esc(client.city || '—')}</span><span><b>Последняя услуга:</b> ${esc(client.service || '—')}</span><span><b>Статус:</b> ${esc(client.status || '—')}</span><span><b>Бюджет:</b> ${money(client.total_budget)}</span></div><div class="v4-crm-actions"><button type="button" data-open-lead="${esc(client.id)}">Открыть последнюю заявку</button></div></article>`).join('') : '<div class="v4-empty">Клиентов пока нет.</div>'}`);
}

async function loadCurrentList(tab) {
  if (renderBusy) return;
  renderBusy = true;
  try {
    if (tab === 'orders') await renderOrdersList();
    if (tab === 'clients') await renderClientsList();
    if (tab === 'calculations') await renderCalculationsList();
    if (tab === 'offers') await renderOffersList();
  } catch (error) {
    const section = MENU_SECTIONS.find((item) => item.key === tab);
    if (section) setContent(section.id, `<div class="v4-empty is-error">Ошибка загрузки раздела: ${esc(error.message || error)}</div>`);
  } finally {
    renderBusy = false;
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-v4-tab-button]');
    if (tabButton) {
      event.preventDefault();
      setActiveTab(tabButton.dataset.v4TabButton || 'leads');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const refresh = event.target.closest('[data-v4-list-refresh]');
    if (refresh) {
      const key = refresh.dataset.v4ListRefresh;
      if (key === 'orders') ordersLoaded = false;
      if (key === 'clients') clientsLoaded = false;
      if (key === 'calculations') calculationsLoaded = false;
      if (key === 'offers') offersLoaded = false;
      loadCurrentList(key);
      return;
    }
    const openOrder = event.target.closest('[data-open-order]');
    if (openOrder) {
      openOrderCard(openOrder.dataset.openOrder);
      return;
    }
    const backToOrders = event.target.closest('[data-back-to-orders]');
    if (backToOrders) {
      setActiveTab('orders');
      return;
    }
    const printOrder = event.target.closest('[data-print-order-task]');
    if (printOrder) {
      openProductionPrint();
      return;
    }
    const orderLead = event.target.closest('[data-open-order-lead]');
    if (orderLead) {
      openLeadRoute(orderLead.dataset.openOrderLead);
      setActiveTab('card');
      return;
    }
    const openLead = event.target.closest('[data-open-lead]');
    if (openLead) {
      openLeadRoute(openLead.dataset.openLead);
      setActiveTab('card');
    }
  }, true);

  document.addEventListener('leader-v4:route-change', (event) => {
    if (event.detail?.leadId) setActiveTab('card', { noLoad: true });
  });
}

function bootWorkspaceMenu() {
  injectStyles();
  ensureSections();
  ensureMenu();
  bindEvents();
  setActiveTab(currentTab || 'leads');
  setTimeout(() => { window.v4SetTab = setActiveTab; }, 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWorkspaceMenu);
else bootWorkspaceMenu();
