import { supabaseClient } from './supabase-client.js';
import { v4State } from './state.js';
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
  { key: 'card', id: 'leadCardSection' }
];

let currentTab = 'leads';
let ordersLoaded = false;
let clientsLoaded = false;
let calculationsLoaded = false;
let offersLoaded = false;
let renderBusy = false;
let eventsBound = false;

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

function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('соглас') || text.includes('готов') || text.includes('создан')) return 'is-good';
  if (text.includes('отказ') || text.includes('спам') || text.includes('отмен')) return 'is-danger';
  if (text.includes('жд') || text.includes('уточ') || text.includes('работ') || text.includes('отправ')) return 'is-warn';
  return '';
}

function injectStyles() {
  if (document.getElementById('v4WorkspaceMenuStyles')) return;
  const style = document.createElement('style');
  style.id = 'v4WorkspaceMenuStyles';
  style.textContent = `
    [data-v4-managed-section][hidden]{display:none!important}
    .v4-layout-tabs{gap:7px!important}
    .v4-layout-tabs button{white-space:nowrap}
    .v4-crm-list{display:grid;gap:12px;margin-top:12px}
    .v4-crm-list-card{border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:14px;box-shadow:0 10px 24px rgba(15,23,42,.05)}
    .v4-crm-list-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .v4-crm-list-head h3{margin:0;font-size:18px;overflow-wrap:anywhere}
    .v4-crm-badge{display:inline-flex;align-items:center;border-radius:999px;background:#e0f2fe;color:#075985;padding:5px 8px;font-size:12px;font-weight:900;white-space:nowrap}
    .v4-crm-badge.is-good{background:#dcfce7;color:#166534}.v4-crm-badge.is-warn{background:#fef3c7;color:#92400e}.v4-crm-badge.is-danger{background:#fee2e2;color:#991b1b}
    .v4-crm-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
    .v4-crm-meta span{border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;color:#334155;padding:6px 9px;font-size:13px}
    .v4-crm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
    .v4-crm-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;margin:12px 0}
    .v4-crm-summary div{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:12px}.v4-crm-summary span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:900}.v4-crm-summary b{display:block;margin-top:5px;font-size:20px}
    .v4-section-placeholder{border:1px dashed #cbd5e1;border-radius:18px;background:#f8fafc;padding:18px;color:#475569}
    @media(max-width:720px){.v4-crm-list-head{display:grid;grid-template-columns:1fr}.v4-layout-tabs button{flex:1 1 calc(50% - 8px)}}
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
      <div>
        <h2>${esc(section.title || section.label)}</h2>
        <p>${esc(section.description || '')}</p>
      </div>
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
  el.innerHTML = `
    <div class="v4-section-head"><div><h2>Настройки</h2><p>Здесь будут настройки компании, шаблонов КП, доступов, статусов и справочников.</p></div></div>
    <div class="v4-section-placeholder">
      <b>Раздел подготовлен.</b><br>
      Следующим шагом сюда можно перенести настройки печатного КП, реквизиты компании и шаблоны стандартных условий.
    </div>
  `;
  workspace().appendChild(el);
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
  INTERNAL_SECTIONS.forEach((section) => {
    const el = document.getElementById(section.id);
    if (el) el.dataset.v4ManagedSection = section.key;
  });
  document.querySelectorAll('.v4-next-card').forEach((el) => {
    el.dataset.v4ManagedSection = 'help';
  });
}

function ensureMenu() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav) return;
  nav.innerHTML = '<b>Главное меню</b>' + MENU_SECTIONS.map((section) => `<button type="button" data-v4-tab-button="${esc(section.key)}">${esc(section.label)}</button>`).join('');
}

function setActiveTab(tab, options = {}) {
  const allowed = new Set(MENU_SECTIONS.map((section) => section.key).concat(['card', 'help']));
  currentTab = allowed.has(tab) ? tab : 'leads';
  document.body.dataset.v4Tab = currentTab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.v4TabButton === currentTab);
  });
  document.querySelectorAll('[data-v4-managed-section]').forEach((el) => {
    el.hidden = el.dataset.v4ManagedSection !== currentTab;
  });
  if (!options.noLoad) loadCurrentList(currentTab);
}

function setContent(sectionId, html) {
  const box = document.getElementById(`${sectionId}Content`);
  if (box) box.innerHTML = html;
}

function summary(items) {
  return `<div class="v4-crm-summary">${items.map((item) => `<div><span>${esc(item.label)}</span><b>${esc(item.value)}</b></div>`).join('')}</div>`;
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
      </article>`).join('') : '<div class="v4-empty">Заказов пока нет.</div>'}
  `);
}

async function renderOffersList(force = false) {
  if (offersLoaded && !force) return;
  offersLoaded = true;
  setContent('offersListSection', '<div class="v4-empty">Загружаю КП...</div>');
  const response = await supabaseClient
    .from('leader_commercial_offers')
    .select('id,lead_id,calculation_id,title,status,total_sum,valid_until,order_id,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (response.error) throw response.error;
  const rows = response.data || [];
  const agreed = rows.filter((row) => row.status === 'Согласовано').length;
  const total = rows.reduce((sum, row) => sum + Number(row.total_sum || 0), 0);
  setContent('offersListSection', `
    ${summary([{ label: 'Всего КП', value: rows.length }, { label: 'Согласовано', value: agreed }, { label: 'Сумма КП', value: money(total) }])}
    ${rows.length ? rows.map((offer) => `
      <article class="v4-crm-list-card">
        <div class="v4-crm-list-head"><h3>${esc(offer.title || 'Коммерческое предложение')}</h3><span class="v4-crm-badge ${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span></div>
        <div class="v4-crm-meta"><span><b>Сумма:</b> ${money(offer.total_sum)}</span><span><b>Действует до:</b> ${dateRu(offer.valid_until)}</span><span><b>Создано:</b> ${dateTimeRu(offer.created_at)}</span><span><b>Заказ:</b> ${offer.order_id ? 'создан' : 'нет'}</span></div>
        ${offer.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(offer.lead_id)}">Открыть заявку</button></div>` : ''}
      </article>`).join('') : '<div class="v4-empty">КП пока нет.</div>'}
  `);
}

async function renderCalculationsList(force = false) {
  if (calculationsLoaded && !force) return;
  calculationsLoaded = true;
  setContent('calculationsListSection', '<div class="v4-empty">Загружаю расчёты...</div>');
  const response = await supabaseClient
    .from('leader_lead_calculations')
    .select('id,lead_id,title,status,client_total,contractor_cost,profit,margin_percent,order_id,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (response.error) throw response.error;
  const rows = response.data || [];
  const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
  const profit = rows.reduce((sum, row) => sum + Number(row.profit || 0), 0);
  setContent('calculationsListSection', `
    ${summary([{ label: 'Расчётов', value: rows.length }, { label: 'Сумма клиенту', value: money(total) }, { label: 'Плановая прибыль', value: money(profit) }])}
    ${rows.length ? rows.map((calc) => `
      <article class="v4-crm-list-card">
        <div class="v4-crm-list-head"><h3>${esc(calc.title || 'Расчёт')}</h3><span class="v4-crm-badge ${statusClass(calc.status)}">${esc(calc.status || 'Черновик')}</span></div>
        <div class="v4-crm-meta"><span><b>Клиенту:</b> ${money(calc.client_total)}</span><span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span><span><b>Прибыль:</b> ${money(calc.profit)}</span><span><b>Маржа:</b> ${calc.margin_percent ? `${Math.round(Number(calc.margin_percent))}%` : '—'}</span><span><b>Создано:</b> ${dateTimeRu(calc.created_at)}</span></div>
        ${calc.lead_id ? `<div class="v4-crm-actions"><button type="button" data-open-lead="${esc(calc.lead_id)}">Открыть заявку</button></div>` : ''}
      </article>`).join('') : '<div class="v4-empty">Расчётов пока нет.</div>'}
  `);
}

async function renderClientsList(force = false) {
  if (clientsLoaded && !force) return;
  clientsLoaded = true;
  setContent('clientsSection', '<div class="v4-empty">Загружаю клиентов...</div>');
  const response = await supabaseClient
    .from('leader_leads')
    .select('id,name,phone,city,source,service,status,budget,estimated_amount,created_at,next_contact_at')
    .order('created_at', { ascending: false })
    .limit(300);
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
  setContent('clientsSection', `
    ${summary([{ label: 'Клиентов', value: rows.length }, { label: 'Заявок в базе', value: (response.data || []).length }, { label: 'Сумма бюджетов', value: money(rows.reduce((s, r) => s + r.total_budget, 0)) }])}
    ${rows.length ? rows.map((client) => `
      <article class="v4-crm-list-card">
        <div class="v4-crm-list-head"><h3>${esc(client.name || 'Без имени')}</h3><span class="v4-crm-badge">${client.lead_count} заявк.</span></div>
        <div class="v4-crm-meta"><span><b>Телефон:</b> ${esc(client.phone || '—')}</span><span><b>Город:</b> ${esc(client.city || '—')}</span><span><b>Последняя услуга:</b> ${esc(client.service || '—')}</span><span><b>Статус:</b> ${esc(client.status || '—')}</span><span><b>Бюджет:</b> ${money(client.total_budget)}</span></div>
        <div class="v4-crm-actions"><button type="button" data-open-lead="${esc(client.id)}">Открыть последнюю заявку</button></div>
      </article>`).join('') : '<div class="v4-empty">Клиентов пока нет.</div>'}
  `);
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
