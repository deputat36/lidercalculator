import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { openLeadRoute } from './router.js';

const SECTIONS = [
  { key: 'leads', label: 'Заявки', id: 'leadsSection' },
  { key: 'orders', label: 'Заказы', id: 'ordersListSection', title: 'Заказы', description: 'Быстрый список заказов: статус, срок, клиент, сумма и оплата.' },
  { key: 'production', label: 'Производство', id: 'productionBoardSection', title: 'Производство', description: 'Производственные и монтажные задания.' },
  { key: 'clients', label: 'Клиенты', id: 'clientsSection', title: 'Клиенты', description: 'Клиенты собираются из заявок: контакты, источники, услуги и активность.' },
  { key: 'calculations', label: 'Расчёты', id: 'calculationsListSection', title: 'Расчёты', description: 'Сохранённые расчёты: сумма клиенту, себестоимость, прибыль и статус.' },
  { key: 'offers', label: 'КП', id: 'offersListSection', title: 'Коммерческие предложения', description: 'Черновики, отправленные, согласованные и отклонённые КП.' },
  { key: 'catalog', label: 'Номенклатура', id: 'catalogSection' },
  { key: 'settings', label: 'Настройки', id: 'settingsSection', title: 'Настройки', description: 'Настройки компании, доступов, статусов и шаблонов.' }
];

const INTERNAL = [
  { key: 'card', id: 'leadCardSection' },
  { key: 'orderCard', id: 'orderCardSection' }
];

const state = {
  currentTab: 'leads',
  loaded: Object.create(null),
  loading: Object.create(null),
  currentOrder: null,
  orderBusy: false,
  orderError: ''
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}

function dateTimeRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('соглас') || text.includes('готов') || text.includes('создан') || text.includes('выдан') || text.includes('закры')) return 'is-good';
  if (text.includes('отказ') || text.includes('спам') || text.includes('отмен') || text.includes('проблем')) return 'is-danger';
  if (text.includes('жд') || text.includes('уточ') || text.includes('работ') || text.includes('отправ') || text.includes('производ')) return 'is-warn';
  return '';
}

function dataOf(order) {
  if (!order) return {};
  if (order.data && typeof order.data === 'object') return order.data;
  if (typeof order.data === 'string') {
    try { return JSON.parse(order.data); } catch (_) { return {}; }
  }
  return {};
}

function orderLeadId(order) {
  const data = dataOf(order);
  return order?.lead_id || data.lead_id || data.leadId || null;
}

function layoutStatus(order) {
  const data = dataOf(order);
  return order?.layout_status || data.layout_status || data.layoutStatus || 'Макета нет';
}

function orderType(order) {
  const data = dataOf(order);
  return order?.order_type || data.order_type || data.orderType || '—';
}

function rowsOf(order) {
  const data = dataOf(order);
  const candidates = [order?.rows, order?.items, data.rows, data.items, data.order_rows, data.orderItems];
  return candidates.find((item) => Array.isArray(item) && item.length) || [];
}

function workspace() {
  return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body;
}

function sectionInfo(key) {
  return SECTIONS.find((item) => item.key === key) || INTERNAL.find((item) => item.key === key);
}

function hostId(key) {
  return `${sectionInfo(key)?.id || key}Content`;
}

function setContent(key, html) {
  const host = document.getElementById(hostId(key));
  if (host) host.innerHTML = html;
}

function summary(items) {
  return `<div class="v4-crm-summary">${items.map((item) => `<div><span>${esc(item.label)}</span><b>${esc(item.value)}</b></div>`).join('')}</div>`;
}

function placeholder(title, description) {
  return `<div class="v4-section-head"><div><h2>${esc(title)}</h2><p>${esc(description || '')}</p></div></div><div class="v4-section-placeholder"><b>Раздел подготовлен.</b><br>Здесь будут настройки, шаблоны и управление доступами.</div>`;
}

function softBox(key, message) {
  return `<div class="v4-empty"><b>Раздел временно не загрузился.</b><br>${esc(message)}<div class="v4-form-actions" style="margin-top:12px"><button type="button" class="v4-primary" data-v4-list-refresh="${esc(key)}">Повторить загрузку</button></div></div>`;
}

function createGenericSection(section) {
  if (document.getElementById(section.id)) return document.getElementById(section.id);
  const el = document.createElement('section');
  el.id = section.id;
  el.className = 'v4-card v4-managed-section';
  el.dataset.v4ManagedSection = section.key;
  el.innerHTML = `<div class="v4-section-head"><div><h2>${esc(section.title || section.label)}</h2><p>${esc(section.description || '')}</p></div><button type="button" class="v4-primary" data-v4-list-refresh="${esc(section.key)}">Обновить</button></div><div id="${esc(section.id)}Content" class="v4-crm-list"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
  const anchor = document.getElementById('catalogSection') || document.getElementById('leadsSection') || workspace().lastElementChild;
  if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', el);
  else workspace().appendChild(el);
  return el;
}

function createOrderCardSection() {
  if (document.getElementById('orderCardSection')) return document.getElementById('orderCardSection');
  const el = document.createElement('section');
  el.id = 'orderCardSection';
  el.className = 'v4-card v4-managed-section';
  el.dataset.v4ManagedSection = 'orderCard';
  el.innerHTML = '<div id="orderCardSectionContent"><div class="v4-empty">Выберите заказ из списка.</div></div>';
  workspace().appendChild(el);
  return el;
}

function ensureSections() {
  SECTIONS.forEach((section) => {
    if (section.key === 'leads' || section.key === 'catalog') {
      const el = document.getElementById(section.id);
      if (el) el.dataset.v4ManagedSection = section.key;
      return;
    }
    if (section.key === 'settings') {
      if (!document.getElementById(section.id)) {
        const el = document.createElement('section');
        el.id = section.id;
        el.className = 'v4-card v4-managed-section';
        el.dataset.v4ManagedSection = section.key;
        el.innerHTML = placeholder(section.title, section.description);
        workspace().appendChild(el);
      }
      return;
    }
    createGenericSection(section);
  });
  createOrderCardSection();
  INTERNAL.forEach((section) => {
    const el = document.getElementById(section.id);
    if (el) el.dataset.v4ManagedSection = section.key;
  });
  document.querySelectorAll('.v4-next-card').forEach((el) => { el.dataset.v4ManagedSection = 'help'; });
}

function ensureMenu() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav) return;
  nav.innerHTML = '<b>Главное меню</b>' + SECTIONS.map((section) => `<button type="button" data-v4-tab-button="${esc(section.key)}">${esc(section.label)}</button>`).join('');
}

function showOnly(tab) {
  const allowed = new Set(SECTIONS.map((section) => section.key).concat(['card', 'orderCard', 'help']));
  state.currentTab = allowed.has(tab) ? tab : 'leads';
  document.body.dataset.v4Tab = state.currentTab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === state.currentTab));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== state.currentTab; });
}

function dispatchTab(tab) {
  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab } }));
}

async function safeLoad(key, loader, force = false) {
  if (state.loading[key]) return state.loading[key];
  if (state.loaded[key] && !force) return null;
  setContent(key, '<div class="v4-empty">Загружаю раздел...</div>');
  state.loading[key] = Promise.resolve()
    .then(loader)
    .then(() => { state.loaded[key] = true; })
    .catch((error) => {
      state.loaded[key] = false;
      setContent(key, softBox(key, friendlyError(error)));
    })
    .finally(() => { state.loading[key] = null; });
  return state.loading[key];
}

async function loadOrders(force = false) {
  return safeLoad('orders', async () => {
    const response = await supabaseClient
      .from('leader_orders')
      .select('id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status')
      .order('created_at', { ascending: false })
      .limit(40);
    if (response.error) throw response.error;
    const rows = response.data || [];
    const active = rows.filter((row) => !['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена'].includes(row.status || '')).length;
    const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
    const unpaid = rows.filter((row) => {
      const text = String(row.payment_status || '').toLowerCase();
      return !text || text.includes('не') || text.includes('част') || text.includes('долг') || text.includes('ожид');
    }).length;
    setContent('orders', `${summary([{ label: 'Всего заказов', value: rows.length }, { label: 'В работе', value: active }, { label: 'Оплата под контролем', value: unpaid }, { label: 'Сумма клиенту', value: money(total) }])}${rows.length ? rows.map((order) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>№${esc(order.order_number || String(order.id).slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h3><span class="v4-crm-badge ${statusClass(order.status)}">${esc(order.status || 'Новый')}</span></div><div class="v4-crm-meta"><span><b>Клиент:</b> ${esc(order.client_name || '—')}</span><span><b>Телефон:</b> ${esc(order.client_phone || '—')}</span><span><b>Срок:</b> ${dateRu(order.deadline)}</span><span><b>Оплата:</b> ${esc(order.payment_status || 'Не указана')}</span><span><b>Сумма:</b> ${money(order.client_total)}</span><span><b>Макет:</b> ${esc(order.layout_status || '—')}</span></div><div class="v4-crm-actions"><button type="button" class="v4-primary" data-open-order="${esc(order.id)}">Открыть заказ</button></div></article>`).join('') : '<div class="v4-empty">Заказов пока нет.</div>'}`);
  }, force);
}

async function loadOffers(force = false) {
  return safeLoad('offers', async () => {
    const response = await supabaseClient.from('leader_commercial_offers').select('id,lead_id,calculation_id,title,status,total_sum,valid_until,order_id,created_at').order('created_at', { ascending: false }).limit(50);
    if (response.error) throw response.error;
    const rows = response.data || [];
    const agreed = rows.filter((row) => row.status === 'Согласовано').length;
    const total = rows.reduce((sum, row) => sum + Number(row.total_sum || 0), 0);
    setContent('offers', `${summary([{ label: 'Всего КП', value: rows.length }, { label: 'Согласовано', value: agreed }, { label: 'Сумма КП', value: money(total) }])}${rows.length ? rows.map((offer) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(offer.title || 'Коммерческое предложение')}</h3><span class="v4-crm-badge ${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span></div><div class="v4-crm-meta"><span><b>Сумма:</b> ${money(offer.total_sum)}</span><span><b>Действует до:</b> ${dateRu(offer.valid_until)}</span><span><b>Создано:</b> ${dateTimeRu(offer.created_at)}</span><span><b>Заказ:</b> ${offer.order_id ? 'создан' : 'нет'}</span></div>${offer.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(offer.lead_id)}">Открыть заявку</button></div>` : ''}</article>`).join('') : '<div class="v4-empty">КП пока нет.</div>'}`);
  }, force);
}

async function loadCalculations(force = false) {
  return safeLoad('calculations', async () => {
    const response = await supabaseClient.from('leader_lead_calculations').select('id,lead_id,title,status,client_total,contractor_cost,profit,margin_percent,order_id,created_at').order('created_at', { ascending: false }).limit(50);
    if (response.error) throw response.error;
    const rows = response.data || [];
    const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
    const profit = rows.reduce((sum, row) => sum + Number(row.profit || 0), 0);
    setContent('calculations', `${summary([{ label: 'Расчётов', value: rows.length }, { label: 'Сумма клиенту', value: money(total) }, { label: 'Плановая прибыль', value: money(profit) }])}${rows.length ? rows.map((calc) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(calc.title || 'Расчёт')}</h3><span class="v4-crm-badge ${statusClass(calc.status)}">${esc(calc.status || 'Черновик')}</span></div><div class="v4-crm-meta"><span><b>Клиенту:</b> ${money(calc.client_total)}</span><span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span><span><b>Прибыль:</b> ${money(calc.profit)}</span><span><b>Маржа:</b> ${calc.margin_percent ? `${Math.round(Number(calc.margin_percent))}%` : '—'}</span><span><b>Создано:</b> ${dateTimeRu(calc.created_at)}</span></div>${calc.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(calc.lead_id)}">Открыть заявку</button></div>` : ''}</article>`).join('') : '<div class="v4-empty">Расчётов пока нет.</div>'}`);
  }, force);
}

async function loadClients(force = false) {
  return safeLoad('clients', async () => {
    const response = await supabaseClient.from('leader_leads').select('id,name,phone,city,source,service,status,budget,estimated_amount,created_at,next_contact_at').order('created_at', { ascending: false }).limit(120);
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
    setContent('clients', `${summary([{ label: 'Клиентов', value: rows.length }, { label: 'Заявок в базе', value: (response.data || []).length }, { label: 'Сумма бюджетов', value: money(rows.reduce((s, r) => s + r.total_budget, 0)) }])}${rows.length ? rows.map((client) => `<article class="v4-crm-list-card"><div class="v4-crm-list-head"><h3>${esc(client.name || 'Без имени')}</h3><span class="v4-crm-badge">${client.lead_count} заявк.</span></div><div class="v4-crm-meta"><span><b>Телефон:</b> ${esc(client.phone || '—')}</span><span><b>Город:</b> ${esc(client.city || '—')}</span><span><b>Последняя услуга:</b> ${esc(client.service || '—')}</span><span><b>Статус:</b> ${esc(client.status || '—')}</span><span><b>Бюджет:</b> ${money(client.total_budget)}</span></div><div class="v4-crm-actions"><button type="button" data-open-lead="${esc(client.id)}">Открыть последнюю заявку</button></div></article>`).join('') : '<div class="v4-empty">Клиентов пока нет.</div>'}`);
  }, force);
}

function renderOrderRows(order) {
  const rows = rowsOf(order);
  if (!rows.length) return '<div class="v4-empty">Позиции заказа пока не найдены в данных заказа.</div>';
  return `<div class="v4-order-rows-table-wrap"><table class="v4-order-rows-table"><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th><th>Комментарий</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td><b>${esc(row.name || row.title || 'Позиция')}</b></td><td>${esc(row.qty || row.quantity || row.count || '')} ${esc(row.unit || '')}</td><td>${money(row.client_price || row.price || row.clientPrice)}</td><td><b>${money(row.client_sum || row.clientSum || row.sum)}</b></td><td>${esc(row.comment || row.note || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderOrderCard() {
  const host = document.getElementById('orderCardSectionContent');
  if (!host) return;
  if (state.orderBusy) { host.innerHTML = '<div class="v4-empty">Загружаю карточку заказа...</div>'; return; }
  if (state.orderError) { host.innerHTML = softBox('orders', state.orderError); return; }
  const order = state.currentOrder;
  if (!order) { host.innerHTML = '<div class="v4-empty">Выберите заказ из списка заказов.</div>'; return; }
  const data = dataOf(order);
  const leadId = orderLeadId(order);
  host.innerHTML = `<div class="v4-order-detail-panel"><div class="v4-order-detail-head"><div><p class="v4-kicker">Карточка заказа</p><h2>№${esc(order.order_number || String(order.id || '').slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h2><p>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</p></div><div class="v4-order-detail-actions"><button type="button" data-back-to-orders>Назад к заказам</button>${leadId ? `<button type="button" data-open-order-lead="${esc(leadId)}">Открыть заявку</button>` : ''}<button type="button" class="v4-primary" data-print-order-task>Печать задания</button></div></div><div class="v4-order-detail-grid"><div><span>Статус</span><b>${esc(order.status || 'Новый')}</b></div><div><span>Тип</span><b>${esc(orderType(order))}</b></div><div><span>Срок</span><b>${dateRu(order.deadline)}</b></div><div><span>Макет</span><b>${esc(layoutStatus(order))}</b></div><div><span>Клиенту</span><b>${money(order.client_total)}</b></div><div><span>Себестоимость</span><b>${money(order.contractor_cost)}</b></div><div><span>Прибыль</span><b>${money(order.profit)}</b></div><div><span>Оплата</span><b>${esc(order.payment_status || 'Не оплачено')}</b></div></div><section class="v4-order-detail-panel" style="margin-top:12px"><h3>Состав заказа</h3>${renderOrderRows(order)}</section><section class="v4-order-detail-panel" style="margin-top:12px"><h3>Комментарий и производственные условия</h3><div class="v4-order-comment">${esc(order.comment || data.comment || data.production_comment || 'Комментарий не заполнен.')}</div></section></div>`;
}

async function openOrderCard(orderId) {
  state.currentOrder = null;
  state.orderError = '';
  state.orderBusy = true;
  setActiveTab('orderCard', { noLoad: true });
  renderOrderCard();
  try {
    const response = await supabaseClient
      .from('leader_orders')
      .select('id,order_number,project_name,status,deadline,client_name,client_phone,client_total,contractor_cost,profit,payment_status,layout_status,production_status,installation_status,comment,data')
      .eq('id', orderId)
      .maybeSingle();
    if (response.error) throw response.error;
    if (!response.data) throw new Error('Заказ не найден');
    state.currentOrder = response.data;
  } catch (error) {
    state.orderError = friendlyError(error);
  } finally {
    state.orderBusy = false;
    renderOrderCard();
  }
}

function loadForTab(tab, force = false) {
  if (tab === 'orders') return loadOrders(force);
  if (tab === 'clients') return loadClients(force);
  if (tab === 'calculations') return loadCalculations(force);
  if (tab === 'offers') return loadOffers(force);
  return null;
}

function setActiveTab(tab, options = {}) {
  if (tab === 'production') {
    window.dispatchEvent(new CustomEvent('leader-v4:force-tab', { detail: { tab: 'production' } }));
    return;
  }
  showOnly(tab);
  dispatchTab(state.currentTab);
  if (!options.noLoad) loadForTab(state.currentTab, false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest?.('[data-v4-tab-button]');
    if (tabButton && tabButton.dataset.v4TabButton !== 'production') {
      event.preventDefault();
      setActiveTab(tabButton.dataset.v4TabButton || 'leads');
      return;
    }
    const refresh = event.target.closest?.('[data-v4-list-refresh]');
    if (refresh) {
      event.preventDefault();
      state.loaded[refresh.dataset.v4ListRefresh] = false;
      loadForTab(refresh.dataset.v4ListRefresh, true);
      return;
    }
    const orderButton = event.target.closest?.('[data-open-order]');
    if (orderButton) { openOrderCard(orderButton.dataset.openOrder); return; }
    const back = event.target.closest?.('[data-back-to-orders]');
    if (back) { setActiveTab('orders'); return; }
    const orderLead = event.target.closest?.('[data-open-order-lead]');
    if (orderLead) { openLeadRoute(orderLead.dataset.openOrderLead); setActiveTab('card', { noLoad: true }); return; }
    const openLead = event.target.closest?.('[data-open-lead]');
    if (openLead) { openLeadRoute(openLead.dataset.openLead); setActiveTab('card', { noLoad: true }); }
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    if (event.detail?.leadId) setActiveTab('card', { noLoad: true });
  });
}

function boot() {
  ensureSections();
  ensureMenu();
  bindEvents();
  showOnly(state.currentTab || 'leads');
  window.v4SetTab = setActiveTab;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
