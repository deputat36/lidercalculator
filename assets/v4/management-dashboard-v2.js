import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const CLOSED_LEADS = new Set(['Спам', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал']);
const CLOSED_ORDERS = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);
const DONE_PRODUCTION = new Set(['Готово', 'Выдано', 'Отменено', 'Отменён', 'Закрыт']);
const DONE_INSTALL = new Set(['Выполнен', 'Закрыт', 'Отменён', 'Отменено']);

let data = { leads: [], orders: [], production: [], installation: [], offers: [] };
let sourceErrors = [];
let busy = false;
let loaded = false;

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
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}
function dataOf(order) {
  if (!order?.data) return {};
  if (typeof order.data === 'object') return order.data;
  try { return JSON.parse(order.data); } catch (_) { return {}; }
}
function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}
function clientTotal(order) {
  const extra = dataOf(order);
  return num(order.client_total || extra.client_total || extra.clientTotal || extra.total_client || extra.totalClient || extra.total);
}
function costTotal(order) {
  const extra = dataOf(order);
  return num(order.contractor_cost || extra.contractor_cost || extra.contractorCost || extra.cost_total || extra.costTotal || extra.contractor_total || extra.contractorTotal);
}
function profitTotal(order) {
  const explicit = num(order.profit || dataOf(order).profit);
  if (explicit) return explicit;
  return clientTotal(order) - costTotal(order);
}
function marginPercent(order) {
  const total = clientTotal(order);
  return total ? Math.round((profitTotal(order) / total) * 100) : null;
}
function paymentText(order) {
  return String(order.payment_status || dataOf(order).payment_status || dataOf(order).paymentStatus || '').trim();
}
function unpaid(order) {
  const text = paymentText(order).toLowerCase();
  if (!text) return true;
  return text.includes('не') || text.includes('част') || text.includes('долг') || text.includes('ожид') || text.includes('без оплат');
}
function noCost(order) { return clientTotal(order) > 0 && costTotal(order) <= 0; }
function lowMargin(order) { const m = marginPercent(order); return m !== null && m < 25; }
function activeLead(lead) { return !CLOSED_LEADS.has(lead.status || 'Новая'); }
function activeOrder(order) { return !CLOSED_ORDERS.has(order.status || 'Новый'); }
function openProduction(job) { return !DONE_PRODUCTION.has(job.production_status || ''); }
function openInstall(job) { return !DONE_INSTALL.has(job.install_status || ''); }
function leadContactToday(lead) {
  if (!lead.next_contact_at) return false;
  const time = new Date(lead.next_contact_at).getTime();
  return Number.isFinite(time) && time >= todayStart() && time <= todayEnd();
}
function leadContactOverdue(lead) {
  if (!lead.next_contact_at) return false;
  const time = new Date(lead.next_contact_at).getTime();
  return Number.isFinite(time) && time < Date.now();
}
function overdueProduction(job) { const d = daysUntil(job.deadline); return openProduction(job) && d !== null && d < 0; }
function overdueInstall(job) { const d = daysUntil(job.scheduled_at); return openInstall(job) && d !== null && d < 0; }
function soonProduction(job) { const d = daysUntil(job.deadline); return openProduction(job) && d !== null && d >= 0 && d <= 3; }
function soonInstall(job) { const d = daysUntil(job.scheduled_at); return openInstall(job) && d !== null && d >= 0 && d <= 3; }
function openOffer(offer) { return !['Согласовано', 'Отклонено', 'Отменено', 'Создан заказ'].includes(offer.status || ''); }
function expiredOffer(offer) {
  if (!offer.valid_until || !openOffer(offer)) return false;
  const time = new Date(offer.valid_until).getTime();
  return Number.isFinite(time) && time < todayStart();
}

function calc() {
  const activeLeads = data.leads.filter(activeLead);
  const activeOrders = data.orders.filter(activeOrder);
  const activeTotal = activeOrders.reduce((s, o) => s + clientTotal(o), 0);
  const activeProfit = activeOrders.reduce((s, o) => s + profitTotal(o), 0);
  return {
    activeLeads,
    newLeads: activeLeads.filter((l) => (l.status || 'Новая') === 'Новая'),
    noPhone: activeLeads.filter((l) => !String(l.phone || '').trim()),
    noNext: activeLeads.filter((l) => !l.next_contact_at),
    leadOverdue: activeLeads.filter(leadContactOverdue),
    leadToday: activeLeads.filter(leadContactToday),
    activeOrders,
    orderOverdue: activeOrders.filter((o) => { const d = daysUntil(o.deadline); return d !== null && d < 0; }),
    orderSoon: activeOrders.filter((o) => { const d = daysUntil(o.deadline); return d !== null && d >= 0 && d <= 3; }),
    unpaidOrders: activeOrders.filter(unpaid),
    noCostOrders: activeOrders.filter(noCost),
    lowMarginOrders: activeOrders.filter(lowMargin),
    activeTotal,
    activeProfit,
    activeMargin: activeTotal ? Math.round((activeProfit / activeTotal) * 100) : 0,
    openProduction: data.production.filter(openProduction),
    openInstall: data.installation.filter(openInstall),
    overdueProduction: data.production.filter(overdueProduction),
    overdueInstall: data.installation.filter(overdueInstall),
    soonProduction: data.production.filter(soonProduction),
    soonInstall: data.installation.filter(soonInstall),
    openOffers: data.offers.filter(openOffer),
    expiredOffers: data.offers.filter(expiredOffer)
  };
}

function ensureStyles() {
  if (document.getElementById('managementDashboardV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'managementDashboardV2Styles';
  style.textContent = `
    .v4-mgmt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}.v4-mgmt-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-mgmt-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-mgmt-stat b{font-size:24px;line-height:1.15}.v4-mgmt-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-mgmt-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-mgmt-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-mgmt-stat.is-main{border-color:#bfdbfe;background:#eff6ff}
    .v4-mgmt-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-mgmt-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-mgmt-actions .v4-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.v4-mgmt-warnings{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}
    .v4-mgmt-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.v4-mgmt-column{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px}.v4-mgmt-column h3{margin:0 0 10px}.v4-mgmt-list{display:grid;gap:10px}.v4-mgmt-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-mgmt-item.is-danger{border-color:#fecaca;background:#fff7f7}.v4-mgmt-item.is-warn{border-color:#fde68a;background:#fffdf3}.v4-mgmt-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-mgmt-item h4{margin:0;font-size:15px}.v4-mgmt-item small{color:#64748b}.v4-mgmt-item button{justify-self:start;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
  `;
  document.head.appendChild(style);
}
function ensureSection() {
  ensureStyles();
  let section = document.getElementById('managementDashboardSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'managementDashboardSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'management_dashboard';
  section.hidden = true;
  section.innerHTML = `<div class="v4-section-head"><div><h2>Управленческий дашборд</h2><p>Единая сводка по заявкам, заказам, КП, производству, монтажу и финансам.</p></div><button type="button" class="v4-primary" data-management-dashboard-refresh>Обновить дашборд</button></div><div id="managementDashboardContent"><div class="v4-empty">Дашборд загрузится при открытии.</div></div>`;
  const first = document.querySelector('#crmWorkspace > .v4-card');
  if (first) first.insertAdjacentElement('afterend', section);
  else (document.getElementById('crmWorkspace') || document.body).prepend(section);
  return section;
}
function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="management_dashboard"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="workdesk"]') || nav.querySelector('[data-v4-tab-button="leads"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'management_dashboard';
  button.textContent = 'Дашборд';
  if (anchor) anchor.insertAdjacentElement('beforebegin', button);
  else nav.appendChild(button);
}
function stat(label, value, type = '') { return `<div class="v4-mgmt-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function top(list, mapper) { return list.slice(0, 6).map(mapper).join('') || '<div class="v4-empty">Нет элементов в этой группе.</div>'; }
function leadItem(lead, note = '', type = '') {
  return `<article class="v4-mgmt-item ${type}"><div class="v4-mgmt-item-head"><h4>${esc(lead.name || 'Без имени')}</h4><small>${esc(lead.status || 'Новая')}</small></div><small>${esc(lead.service || 'Услуга не указана')} · ${esc(lead.source || 'Источник не указан')}</small><small>Телефон: ${esc(lead.phone || '—')} · Следующий контакт: ${dateTimeRu(lead.next_contact_at)}</small>${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-management-open-lead="${esc(lead.id)}">Открыть заявку</button></article>`;
}
function orderTitle(order) { return `№${order.order_number || String(order.id || '').slice(0, 8)} — ${order.project_name || 'Заказ'}`; }
function orderItem(order, note = '', type = '') {
  return `<article class="v4-mgmt-item ${type}"><div class="v4-mgmt-item-head"><h4>${esc(orderTitle(order))}</h4><small>${esc(order.status || 'Новый')}</small></div><small>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</small><small>Срок: ${dateRu(order.deadline)} · Оплата: ${esc(paymentText(order) || 'не указана')}</small><small>Сумма: ${money(clientTotal(order))} · Прибыль: ${money(profitTotal(order))}${marginPercent(order) !== null ? ` · Маржа: ${marginPercent(order)}%` : ''}</small>${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button></article>`;
}
function jobItem(job, type, note = '') {
  const status = type === 'production' ? job.production_status : job.install_status;
  const date = type === 'production' ? job.deadline : job.scheduled_at;
  return `<article class="v4-mgmt-item is-warn"><div class="v4-mgmt-item-head"><h4>${esc(job.title || (type === 'production' ? 'Производство' : 'Монтаж'))}</h4><small>${esc(status || '—')}</small></div><small>${type === 'production' ? 'Срок производства' : 'Монтаж'}: ${dateRu(date)}</small>${type === 'installation' ? `<small>Адрес: ${esc(job.address || '—')}</small>` : ''}${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-open-order="${esc(job.order_id)}">Открыть заказ</button></article>`;
}
function offerItem(offer, note = '', type = '') {
  return `<article class="v4-mgmt-item ${type}"><div class="v4-mgmt-item-head"><h4>${esc(offer.title || 'Коммерческое предложение')}</h4><small>${esc(offer.status || 'Черновик')}</small></div><small>Сумма: ${money(offer.total_sum)} · Действует до: ${dateRu(offer.valid_until)}</small>${note ? `<small>${esc(note)}</small>` : ''}${offer.lead_id ? `<button type="button" data-management-open-lead="${esc(offer.lead_id)}">Открыть заявку</button>` : ''}</article>`;
}
function render() {
  ensureSection();
  const content = document.getElementById('managementDashboardContent');
  if (!content) return;
  if (busy) { content.innerHTML = '<div class="v4-empty">Загружаю управленческий дашборд...</div>'; return; }
  if (!loaded) { content.innerHTML = '<div class="v4-empty">Нажмите «Обновить дашборд» или откройте раздел ещё раз.</div>'; return; }
  const c = calc();
  const urgent = c.noPhone.length + c.leadOverdue.length + c.orderOverdue.length + c.unpaidOrders.length + c.overdueProduction.length + c.overdueInstall.length + c.expiredOffers.length;
  const warnings = sourceErrors.length ? `<div class="v4-mgmt-warnings">Часть данных не загрузилась: ${sourceErrors.map(esc).join('; ')}. Остальные блоки показаны.</div>` : '';
  content.innerHTML = `${warnings}<div class="v4-mgmt-grid">
    ${stat('Срочных рисков', urgent, urgent ? 'is-danger' : 'is-good')}${stat('Активные заявки', c.activeLeads.length, 'is-main')}${stat('Новые заявки', c.newLeads.length, c.newLeads.length ? 'is-good' : '')}${stat('Без телефона', c.noPhone.length, c.noPhone.length ? 'is-danger' : '')}${stat('Контакты сегодня', c.leadToday.length, c.leadToday.length ? 'is-good' : '')}${stat('Активные заказы', c.activeOrders.length, 'is-main')}${stat('Просрочены заказы', c.orderOverdue.length, c.orderOverdue.length ? 'is-danger' : '')}${stat('Срок 1–3 дня', c.orderSoon.length, c.orderSoon.length ? 'is-warn' : '')}${stat('Не оплачено / частично', c.unpaidOrders.length, c.unpaidOrders.length ? 'is-danger' : '')}${stat('Активная сумма', money(c.activeTotal), 'is-main')}${stat('Потенц. прибыль', money(c.activeProfit), c.activeProfit > 0 ? 'is-good' : 'is-warn')}${stat('Средняя маржа', `${c.activeMargin}%`, c.activeMargin < 25 && c.activeTotal ? 'is-danger' : 'is-good')}${stat('Производство открыто', c.openProduction.length)}${stat('Монтаж открыт', c.openInstall.length)}${stat('Проср. произв./монтаж', c.overdueProduction.length + c.overdueInstall.length, c.overdueProduction.length + c.overdueInstall.length ? 'is-danger' : '')}${stat('Открытые КП', c.openOffers.length)}
  </div><div class="v4-mgmt-actions"><button type="button" class="v4-primary" data-management-dashboard-refresh>Обновить</button><button type="button" data-management-tab="workdesk">Рабочий стол</button><button type="button" data-management-tab="contact_control">Контроль контактов</button><button type="button" data-management-tab="order_control">Контроль заказов</button><button type="button" data-management-tab="production_control">Контроль производства</button><button type="button" data-management-tab="finance_control">Финансы</button></div>
  <div class="v4-mgmt-columns"><section class="v4-mgmt-column"><h3>Срочно по заявкам</h3><div class="v4-mgmt-list">${top([...c.noPhone, ...c.leadOverdue, ...c.noNext], (lead) => leadItem(lead, !lead.phone ? 'Нет телефона' : leadContactOverdue(lead) ? 'Просрочен следующий контакт' : 'Не назначен следующий контакт', !lead.phone || leadContactOverdue(lead) ? 'is-danger' : 'is-warn'))}</div></section><section class="v4-mgmt-column"><h3>Срочно по заказам</h3><div class="v4-mgmt-list">${top([...c.orderOverdue, ...c.orderSoon, ...c.unpaidOrders], (order) => orderItem(order, daysUntil(order.deadline) < 0 ? 'Срок заказа просрочен' : unpaid(order) ? 'Оплата требует контроля' : 'Ближайший срок', daysUntil(order.deadline) < 0 || unpaid(order) ? 'is-danger' : 'is-warn'))}</div></section><section class="v4-mgmt-column"><h3>Производство и монтаж</h3><div class="v4-mgmt-list">${top([...c.overdueProduction, ...c.overdueInstall, ...c.soonProduction, ...c.soonInstall], (job) => job.production_status ? jobItem(job, 'production', overdueProduction(job) ? 'Производство просрочено' : 'Ближайший срок производства') : jobItem(job, 'installation', overdueInstall(job) ? 'Монтаж просрочен' : 'Ближайший монтаж'))}</div></section><section class="v4-mgmt-column"><h3>Финансовые риски</h3><div class="v4-mgmt-list">${top([...c.unpaidOrders, ...c.noCostOrders, ...c.lowMarginOrders], (order) => orderItem(order, unpaid(order) ? 'Оплата не закрыта' : noCost(order) ? 'Нет себестоимости' : 'Низкая маржа', 'is-danger'))}</div></section><section class="v4-mgmt-column"><h3>КП под контролем</h3><div class="v4-mgmt-list">${top([...c.expiredOffers, ...c.openOffers], (offer) => offerItem(offer, expiredOffer(offer) ? 'Срок действия КП истёк' : 'КП открыто, нужен контроль ответа', expiredOffer(offer) ? 'is-danger' : 'is-warn'))}</div></section><section class="v4-mgmt-column"><h3>Новые заявки</h3><div class="v4-mgmt-list">${top(c.newLeads, (lead) => leadItem(lead, 'Новая заявка', 'is-warn'))}</div></section></div>`;
}
async function safeQuery(label, query, timeoutMs = 18000) {
  try {
    const response = await timeout(query, timeoutMs, `${label}: долгий ответ`);
    if (response.error) throw response.error;
    return response.data || [];
  } catch (error) {
    const message = `${label} — ${friendlyError(error)}`;
    sourceErrors.push(message);
    return [];
  }
}
async function loadData(force = false) {
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true; sourceErrors = []; render();
  try {
    setStatus('Загружаю управленческий дашборд...', 'warn');
    const [leads, orders, production, installation, offers] = await Promise.all([
      safeQuery('Заявки', supabaseClient.from('leader_leads').select('id,created_at,name,phone,source,service,status,next_contact_at,budget,estimated_amount,page_url,city').order('created_at', { ascending: false }).limit(180)),
      safeQuery('Заказы', supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,client_name,client_phone,client_total,contractor_cost,profit,payment_status,created_at,layout_status,data').order('created_at', { ascending: false }).limit(180)),
      safeQuery('Производство', supabaseClient.from('leader_production_jobs').select('*').order('deadline', { ascending: true }).limit(160)),
      safeQuery('Монтаж', supabaseClient.from('leader_installation_jobs').select('*').order('scheduled_at', { ascending: true }).limit(160)),
      safeQuery('КП', supabaseClient.from('leader_commercial_offers').select('id,lead_id,calculation_id,title,status,total_sum,valid_until,order_id,created_at').order('created_at', { ascending: false }).limit(160))
    ]);
    data = { leads, orders, production, installation, offers };
    loaded = true;
    setStatus(sourceErrors.length ? 'Дашборд загружен частично' : 'Управленческий дашборд загружен', sourceErrors.length ? 'warn' : 'good');
  } catch (error) {
    sourceErrors.push(friendlyError(error));
    loaded = true;
    toast(friendlyError(error));
    setStatus('Дашборд загружен частично', 'warn');
  } finally { busy = false; render(); }
}
function showDashboard() {
  ensureSection(); ensureNav(); document.body.dataset.v4Tab = 'management_dashboard';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'management_dashboard'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'management_dashboard'; });
  loadData(false); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function boot() {
  ensureSection(); ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => { setTimeout(ensureNav, 300); if (document.body.dataset.v4Tab === 'management_dashboard') loadData(false); });
  document.addEventListener('leader-v4:tab-opened', (event) => { setTimeout(ensureNav, 150); if (event.detail?.tab === 'management_dashboard' || document.body.dataset.v4Tab === 'management_dashboard') loadData(false); });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="management_dashboard"]');
    if (tab) { event.preventDefault(); event.stopPropagation(); showDashboard(); return; }
    if (event.target.closest?.('[data-management-dashboard-refresh]')) { event.preventDefault(); loadData(true); return; }
    const leadButton = event.target.closest?.('[data-management-open-lead]');
    if (leadButton) { openLeadRoute(leadButton.dataset.managementOpenLead); const setTab = window.v4SetTab; if (typeof setTab === 'function') setTab('card', { noLoad: true }); return; }
    const target = event.target.closest?.('[data-management-tab]')?.dataset.managementTab;
    if (target) document.querySelector(`[data-v4-tab-button="${target}"]`)?.click();
  }, true);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
