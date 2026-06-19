import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status,data';
const CLOSED_ORDER = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);
const DONE_PRODUCTION = new Set(['Готово', 'Выдано', 'Отменено', 'Отменён', 'Закрыт']);
const DONE_INSTALL = new Set(['Выполнен', 'Закрыт', 'Отменён', 'Отменено']);

let state = { orders: [], production: [], installation: [] };
let busy = false;
let loaded = false;
let errorText = '';

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

function daysUntil(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function dataOf(order) {
  if (!order?.data) return {};
  if (typeof order.data === 'object') return order.data;
  try { return JSON.parse(order.data); } catch (_) { return {}; }
}

function activeOrder(order) {
  return !CLOSED_ORDER.has(order.status || 'Новый');
}

function openProduction(job) {
  return !DONE_PRODUCTION.has(job.production_status || '');
}

function openInstall(job) {
  return !DONE_INSTALL.has(job.install_status || '');
}

function overdue(value, status, doneSet) {
  if (!value || doneSet.has(status || '')) return false;
  const days = daysUntil(value);
  return days !== null && days < 0;
}

function dueSoon(value, status, doneSet) {
  if (!value || doneSet.has(status || '')) return false;
  const days = daysUntil(value);
  return days !== null && days >= 0 && days <= 3;
}

function needsInstall(order) {
  const data = dataOf(order);
  const text = [
    order.project_name,
    order.status,
    data.installation,
    data.need_installation,
    data.install_required,
    data.installation_required,
    data.install_place,
    data.installation_address,
    data.address,
    data.comment,
    data.production_comment,
    data.order_type,
    data.orderType
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('монтаж') || text.includes('установ') || text.includes('выезд') || text.includes('адрес монтажа');
}

function orderMap() {
  return new Map((state.orders || []).map((order) => [order.id, order]));
}

function jobMap(jobs) {
  const map = new Map();
  jobs.forEach((job) => {
    if (!job.order_id) return;
    if (!map.has(job.order_id)) map.set(job.order_id, []);
    map.get(job.order_id).push(job);
  });
  return map;
}

function groups() {
  const activeOrders = state.orders.filter(activeOrder);
  const productionByOrder = jobMap(state.production);
  const installByOrder = jobMap(state.installation);
  const productionOpen = state.production.filter(openProduction);
  const installOpen = state.installation.filter(openInstall);
  return {
    activeOrders,
    productionOpen,
    installOpen,
    noProductionJob: activeOrders.filter((order) => !productionByOrder.has(order.id)),
    noInstallationJob: activeOrders.filter((order) => needsInstall(order) && !installByOrder.has(order.id)),
    productionOverdue: productionOpen.filter((job) => overdue(job.deadline, job.production_status, DONE_PRODUCTION)),
    installOverdue: installOpen.filter((job) => overdue(job.scheduled_at, job.install_status, DONE_INSTALL)),
    productionSoon: productionOpen.filter((job) => dueSoon(job.deadline, job.production_status, DONE_PRODUCTION)),
    installSoon: installOpen.filter((job) => dueSoon(job.scheduled_at, job.install_status, DONE_INSTALL)),
    productionProblems: productionOpen.filter((job) => String(job.production_status || '').toLowerCase().includes('проблем') || String(job.production_status || '').toLowerCase().includes('срыв') || String(job.production_status || '').toLowerCase().includes('передел')),
    installProblems: installOpen.filter((job) => String(job.install_status || '').toLowerCase().includes('проблем') || String(job.install_status || '').toLowerCase().includes('срыв') || String(job.install_status || '').toLowerCase().includes('передел'))
  };
}

function ensureStyles() {
  if (document.getElementById('productionControlV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionControlV1Styles';
  style.textContent = `
    .v4-prod-control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin:14px 0}.v4-prod-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .v4-prod-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-prod-stat b{font-size:30px;line-height:1.1}.v4-prod-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-prod-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-prod-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}
    .v4-prod-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-prod-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-prod-actions .v4-primary{background:#16a34a;border-color:#16a34a;color:#fff}
    .v4-prod-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}.v4-prod-column{border:1px solid #d1fae5;background:#fff;border-radius:18px;padding:14px}.v4-prod-column h3{margin:0 0 10px;color:#166534}.v4-prod-list{display:grid;gap:10px}.v4-prod-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-prod-item.is-danger{border-color:#fecaca;background:#fff7f7}.v4-prod-item.is-warn{border-color:#fde68a;background:#fffdf3}.v4-prod-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-prod-item h4{margin:0;font-size:15px}.v4-prod-item small{color:#64748b}.v4-prod-item button{justify-self:start;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:12px;padding:8px 10px;font-weight:900}
    @media(max-width:640px){.v4-prod-column{border-radius:14px;padding:12px}.v4-prod-actions button,.v4-prod-item button{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  ensureStyles();
  let section = document.getElementById('productionControlSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'productionControlSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'production_control';
  section.hidden = true;
  section.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Контроль производства и монтажа</h2>
        <p>Проверка заказов без заданий, открытых производственных задач, монтажа, сроков и проблем.</p>
      </div>
      <button type="button" class="v4-primary" data-production-control-refresh>Обновить контроль</button>
    </div>
    <div id="productionControlContent"><div class="v4-empty">Раздел загрузится при открытии.</div></div>
  `;
  const production = document.getElementById('productionBoardSection');
  if (production) production.insertAdjacentElement('afterend', section);
  else (document.getElementById('crmWorkspace') || document.body).appendChild(section);
  return section;
}

function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="production_control"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="production"]') || nav.querySelector('[data-v4-tab-button="order_control"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'production_control';
  button.textContent = 'Контроль производства';
  if (anchor) anchor.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}

function stat(label, value, type = '') {
  return `<div class="v4-prod-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function orderTitle(order) {
  return `№${order.order_number || String(order.id || '').slice(0, 8)} — ${order.project_name || 'Заказ'}`;
}

function jobTitle(job, order) {
  return job.title || order?.project_name || `Заказ ${String(job.order_id || '').slice(0, 8)}`;
}

function orderCard(order, note = '', danger = false) {
  return `<article class="v4-prod-item ${danger ? 'is-danger' : 'is-warn'}">
    <div class="v4-prod-item-head"><h4>${esc(orderTitle(order))}</h4><small>${esc(order.status || 'Новый')}</small></div>
    <small>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</small>
    <small>Срок заказа: ${dateRu(order.deadline)} · Сумма: ${money(order.client_total)}</small>
    <small>Макет: ${esc(order.layout_status || 'Не указан')}</small>
    ${note ? `<small>${esc(note)}</small>` : ''}
    <button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button>
  </article>`;
}

function jobCard(job, type, note = '') {
  const order = orderMap().get(job.order_id);
  const date = type === 'production' ? job.deadline : job.scheduled_at;
  const status = type === 'production' ? job.production_status : job.install_status;
  const danger = type === 'production' ? overdue(date, status, DONE_PRODUCTION) : overdue(date, status, DONE_INSTALL);
  return `<article class="v4-prod-item ${danger ? 'is-danger' : 'is-warn'}">
    <div class="v4-prod-item-head"><h4>${esc(jobTitle(job, order))}</h4><small>${esc(status || '—')}</small></div>
    <small>Заказ: ${esc(order ? orderTitle(order) : String(job.order_id || '').slice(0, 8))}</small>
    <small>${type === 'production' ? 'Срок производства' : 'Монтаж'}: ${dateRu(date)}</small>
    ${type === 'installation' ? `<small>Адрес: ${esc(job.address || dataOf(order).install_place || dataOf(order).installation_address || '—')}</small>` : `<small>Макет: ${esc(job.layout_status || order?.layout_status || '—')}</small>`}
    ${note ? `<small>${esc(note)}</small>` : ''}
    <button type="button" data-open-order="${esc(job.order_id)}">Открыть заказ</button>
  </article>`;
}

function top(list, mapper) {
  return list.slice(0, 6).map(mapper).join('') || '<div class="v4-empty">Нет задач в этой группе.</div>';
}

function render() {
  ensureSection();
  const content = document.getElementById('productionControlContent');
  if (!content) return;
  if (busy) {
    content.innerHTML = '<div class="v4-empty">Загружаю производство и монтаж...</div>';
    return;
  }
  if (errorText) {
    content.innerHTML = `<div class="v4-empty is-error">${esc(errorText)}<div class="v4-form-actions" style="margin-top:12px"><button type="button" class="v4-primary" data-production-control-refresh>Повторить</button></div></div>`;
    return;
  }
  if (!loaded) {
    content.innerHTML = '<div class="v4-empty">Нажмите «Обновить контроль» или откройте раздел ещё раз.</div>';
    return;
  }
  const g = groups();
  const problemCount = g.productionProblems.length + g.installProblems.length;
  const overdueCount = g.productionOverdue.length + g.installOverdue.length;
  const soonCount = g.productionSoon.length + g.installSoon.length;
  content.innerHTML = `
    <div class="v4-prod-control-grid">
      ${stat('Активные заказы', g.activeOrders.length)}
      ${stat('Производство открыто', g.productionOpen.length, g.productionOpen.length ? 'is-good' : '')}
      ${stat('Монтаж открыт', g.installOpen.length, g.installOpen.length ? 'is-good' : '')}
      ${stat('Нет задания в производство', g.noProductionJob.length, g.noProductionJob.length ? 'is-warn' : '')}
      ${stat('Нет задания на монтаж', g.noInstallationJob.length, g.noInstallationJob.length ? 'is-warn' : '')}
      ${stat('Просрочено', overdueCount, overdueCount ? 'is-danger' : '')}
      ${stat('Срок 1–3 дня', soonCount, soonCount ? 'is-warn' : '')}
      ${stat('Проблемы', problemCount, problemCount ? 'is-danger' : '')}
    </div>
    <div class="v4-prod-actions">
      <button type="button" class="v4-primary" data-production-tab-open>Открыть доску производства</button>
      <button type="button" data-production-control-refresh>Обновить</button>
    </div>
    <div class="v4-prod-columns">
      <section class="v4-prod-column"><h3>Заказы без задания в производство</h3><div class="v4-prod-list">${top(g.noProductionJob, (order) => orderCard(order, 'Проверьте, нужно ли создать производственное задание'))}</div></section>
      <section class="v4-prod-column"><h3>Заказы без задания на монтаж</h3><div class="v4-prod-list">${top(g.noInstallationJob, (order) => orderCard(order, 'По заказу есть признаки монтажа, но монтажного задания не найдено'))}</div></section>
      <section class="v4-prod-column"><h3>Просрочено</h3><div class="v4-prod-list">${top([...g.productionOverdue, ...g.installOverdue], (job) => job.deadline ? jobCard(job, 'production', 'Срок просрочен') : jobCard(job, 'installation', 'Монтаж просрочен'))}</div></section>
      <section class="v4-prod-column"><h3>Ближайшие 1–3 дня</h3><div class="v4-prod-list">${top([...g.productionSoon, ...g.installSoon], (job) => job.deadline ? jobCard(job, 'production', 'Ближайший срок') : jobCard(job, 'installation', 'Ближайший монтаж'))}</div></section>
      <section class="v4-prod-column"><h3>Проблемные задачи</h3><div class="v4-prod-list">${top([...g.productionProblems, ...g.installProblems], (job) => job.production_status ? jobCard(job, 'production', 'Проблема в производстве') : jobCard(job, 'installation', 'Проблема на монтаже'))}</div></section>
    </div>
  `;
}

async function loadData(force = false) {
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  errorText = '';
  render();
  try {
    setStatus('Загружаю контроль производства...', 'warn');
    const [orders, production, installation] = await Promise.all([
      timeout(supabaseClient.from('leader_orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).limit(180), 30000, 'Заказы для производства не загрузились за 30 секунд'),
      timeout(supabaseClient.from('leader_production_jobs').select('*').order('deadline', { ascending: true }).limit(180), 30000, 'Производственные задания не загрузились за 30 секунд'),
      timeout(supabaseClient.from('leader_installation_jobs').select('*').order('scheduled_at', { ascending: true }).limit(180), 30000, 'Монтажные задания не загрузились за 30 секунд')
    ]);
    if (orders.error) throw orders.error;
    if (production.error) throw production.error;
    if (installation.error) throw installation.error;
    state = { orders: orders.data || [], production: production.data || [], installation: installation.data || [] };
    loaded = true;
    setStatus('Контроль производства загружен', 'good');
  } catch (error) {
    errorText = friendlyError(error);
    toast(errorText);
    setStatus(`Ошибка контроля производства: ${errorText}`, 'error');
  } finally {
    busy = false;
    render();
  }
}

function showProductionControl() {
  ensureSection();
  ensureNav();
  document.body.dataset.v4Tab = 'production_control';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'production_control'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'production_control'; });
  loadData(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => {
    setTimeout(ensureNav, 300);
    if (document.body.dataset.v4Tab === 'production_control') loadData(false);
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    setTimeout(ensureNav, 150);
    if (event.detail?.tab === 'production_control' || document.body.dataset.v4Tab === 'production_control') loadData(false);
  });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="production_control"]');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      showProductionControl();
      return;
    }
    if (event.target.closest?.('[data-production-control-refresh]')) {
      event.preventDefault();
      loadData(true);
      return;
    }
    if (event.target.closest?.('[data-production-tab-open]')) {
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('production');
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
