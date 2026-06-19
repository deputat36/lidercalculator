import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status,data,installation_status,installation_address,installation_scheduled_at,production_status';
const CLOSED_ORDER = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);
const DONE_PROD = new Set(['Готово', 'Выдано', 'Отменено', 'Отменён', 'Закрыт']);
const DONE_INSTALL = new Set(['Выполнен', 'Закрыт', 'Отменён', 'Отменено']);
let state = { orders: [], production: [], installation: [] };
let warnings = [];
let busy = false;
let loaded = false;

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function money(value) { const n = Number(value || 0); return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—'; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); } }
function daysUntil(value) { if (!value) return null; const d = new Date(value); if (!Number.isFinite(d.getTime())) return null; const t = new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.round((d.getTime() - t.getTime()) / 86400000); }
function dataOf(order) { if (!order?.data) return {}; if (typeof order.data === 'object') return order.data; try { return JSON.parse(order.data); } catch (_) { return {}; } }
function activeOrder(order) { return !CLOSED_ORDER.has(order.status || 'Новый'); }
function openProduction(job) { return !DONE_PROD.has(job.production_status || ''); }
function openInstall(job) { return !DONE_INSTALL.has(job.install_status || ''); }
function overdue(value, status, doneSet) { const d = daysUntil(value); return !doneSet.has(status || '') && d !== null && d < 0; }
function dueSoon(value, status, doneSet) { const d = daysUntil(value); return !doneSet.has(status || '') && d !== null && d >= 0 && d <= 3; }
function needsInstall(order) {
  const d = dataOf(order);
  const text = [order.project_name, order.status, order.installation_status, order.installation_address, order.installation_scheduled_at, d.installation, d.need_installation, d.install_required, d.installation_required, d.install_place, d.installation_address, d.address, d.comment, d.order_type, d.orderType].filter(Boolean).join(' ').toLowerCase();
  return text.includes('монтаж') || text.includes('установ') || text.includes('выезд') || text.includes('адрес монтажа');
}
function jobMap(jobs) { const map = new Map(); jobs.forEach((job) => { if (!job.order_id) return; if (!map.has(job.order_id)) map.set(job.order_id, []); map.get(job.order_id).push(job); }); return map; }
function orderMap() { return new Map((state.orders || []).map((o) => [o.id, o])); }
function groups() {
  const activeOrders = state.orders.filter(activeOrder);
  const prodByOrder = jobMap(state.production);
  const instByOrder = jobMap(state.installation);
  const prodOpen = state.production.filter(openProduction);
  const instOpen = state.installation.filter(openInstall);
  return {
    activeOrders,
    prodOpen,
    instOpen,
    noProductionJob: activeOrders.filter((o) => !prodByOrder.has(o.id) && !['Готово', 'Выдано'].includes(o.production_status || '')),
    noInstallationJob: activeOrders.filter((o) => needsInstall(o) && !instByOrder.has(o.id)),
    prodOverdue: prodOpen.filter((j) => overdue(j.deadline, j.production_status, DONE_PROD)),
    instOverdue: instOpen.filter((j) => overdue(j.scheduled_at, j.install_status, DONE_INSTALL)),
    prodSoon: prodOpen.filter((j) => dueSoon(j.deadline, j.production_status, DONE_PROD)),
    instSoon: instOpen.filter((j) => dueSoon(j.scheduled_at, j.install_status, DONE_INSTALL)),
    prodProblems: prodOpen.filter((j) => /проблем|срыв|передел/i.test(j.production_status || '')),
    instProblems: instOpen.filter((j) => /проблем|срыв|передел/i.test(j.install_status || ''))
  };
}
function ensureStyles() {
  if (document.getElementById('productionControlV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionControlV2Styles';
  style.textContent = `.v4-prod-control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px;margin:14px 0}.v4-prod-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-prod-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-prod-stat b{font-size:26px}.v4-prod-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-prod-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-prod-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-prod-warnings{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}.v4-prod-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-prod-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-prod-actions .v4-primary{background:#16a34a;border-color:#16a34a;color:#fff}.v4-prod-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}.v4-prod-column{border:1px solid #d1fae5;background:#fff;border-radius:18px;padding:14px}.v4-prod-column h3{margin:0 0 10px;color:#166534}.v4-prod-list{display:grid;gap:10px}.v4-prod-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-prod-item.is-danger{border-color:#fecaca;background:#fff7f7}.v4-prod-item.is-warn{border-color:#fde68a;background:#fffdf3}.v4-prod-item-head{display:flex;justify-content:space-between;gap:10px}.v4-prod-item h4{margin:0;font-size:15px}.v4-prod-item small{color:#64748b}.v4-prod-item button{justify-self:start;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:12px;padding:8px 10px;font-weight:900}`;
  document.head.appendChild(style);
}
function ensureSection() {
  ensureStyles(); let section = document.getElementById('productionControlSection'); if (section) return section;
  section = document.createElement('section'); section.id = 'productionControlSection'; section.className = 'v4-card v4-managed-section'; section.dataset.v4ManagedSection = 'production_control'; section.hidden = true;
  section.innerHTML = `<div class="v4-section-head"><div><h2>Контроль производства и монтажа</h2><p>Проверка заказов без заданий, производственных задач, монтажа, сроков и проблем.</p></div><button type="button" class="v4-primary" data-production-control-refresh>Обновить контроль</button></div><div id="productionControlContent"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
  (document.getElementById('crmWorkspace') || document.body).appendChild(section); return section;
}
function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs'); if (!nav || nav.querySelector('[data-v4-tab-button="production_control"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="production"]') || nav.querySelector('[data-v4-tab-button="order_control"]');
  const button = document.createElement('button'); button.type = 'button'; button.dataset.v4TabButton = 'production_control'; button.textContent = 'Контроль производства';
  if (anchor) anchor.insertAdjacentElement('afterend', button); else nav.appendChild(button);
}
function stat(label, value, type = '') { return `<div class="v4-prod-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function orderTitle(o) { return `№${o.order_number || String(o.id || '').slice(0, 8)} — ${o.project_name || 'Заказ'}`; }
function orderCard(order, note = '') { return `<article class="v4-prod-item is-warn"><div class="v4-prod-item-head"><h4>${esc(orderTitle(order))}</h4><small>${esc(order.status || 'Новый')}</small></div><small>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</small><small>Срок заказа: ${dateRu(order.deadline)} · Сумма: ${money(order.client_total)}</small><small>Макет: ${esc(order.layout_status || 'Не указан')}</small>${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button></article>`; }
function jobCard(job, type, note = '') {
  const order = orderMap().get(job.order_id);
  const date = type === 'production' ? job.deadline : job.scheduled_at;
  const status = type === 'production' ? job.production_status : job.install_status;
  const danger = type === 'production' ? overdue(date, status, DONE_PROD) : overdue(date, status, DONE_INSTALL);
  return `<article class="v4-prod-item ${danger ? 'is-danger' : 'is-warn'}"><div class="v4-prod-item-head"><h4>${esc(job.title || order?.project_name || 'Задание')}</h4><small>${esc(status || '—')}</small></div><small>Заказ: ${esc(order ? orderTitle(order) : String(job.order_id || '').slice(0, 8))}</small><small>${type === 'production' ? 'Срок производства' : 'Монтаж'}: ${dateRu(date)}</small>${type === 'installation' ? `<small>Адрес: ${esc(job.address || order?.installation_address || '—')}</small>` : `<small>Макет: ${esc(job.layout_status || order?.layout_status || '—')}</small>`}${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-open-order="${esc(job.order_id)}">Открыть заказ</button></article>`;
}
function top(list, mapper) { return list.slice(0, 6).map(mapper).join('') || '<div class="v4-empty">Нет задач в этой группе.</div>'; }
function render() {
  ensureSection(); const content = document.getElementById('productionControlContent'); if (!content) return;
  if (busy) { content.innerHTML = '<div class="v4-empty">Загружаю производство и монтаж...</div>'; return; }
  if (!loaded) { content.innerHTML = '<div class="v4-empty">Нажмите «Обновить контроль» или откройте раздел ещё раз.</div>'; return; }
  const g = groups(); const overdueCount = g.prodOverdue.length + g.instOverdue.length; const soonCount = g.prodSoon.length + g.instSoon.length; const problemCount = g.prodProblems.length + g.instProblems.length;
  const warn = warnings.length ? `<div class="v4-prod-warnings">${warnings.map(esc).join('; ')}. Раздел показан в частичном режиме.</div>` : '';
  content.innerHTML = `${warn}<div class="v4-prod-control-grid">${stat('Активные заказы', g.activeOrders.length)}${stat('Производство открыто', g.prodOpen.length, g.prodOpen.length ? 'is-good' : '')}${stat('Монтаж открыт', g.instOpen.length, g.instOpen.length ? 'is-good' : '')}${stat('Нет задания в производство', g.noProductionJob.length, g.noProductionJob.length ? 'is-warn' : '')}${stat('Нет задания на монтаж', g.noInstallationJob.length, g.noInstallationJob.length ? 'is-warn' : '')}${stat('Просрочено', overdueCount, overdueCount ? 'is-danger' : '')}${stat('Срок 1–3 дня', soonCount, soonCount ? 'is-warn' : '')}${stat('Проблемы', problemCount, problemCount ? 'is-danger' : '')}</div><div class="v4-prod-actions"><button type="button" class="v4-primary" data-production-tab-open>Открыть доску производства</button><button type="button" data-production-control-refresh>Обновить</button></div><div class="v4-prod-columns"><section class="v4-prod-column"><h3>Заказы без задания в производство</h3><div class="v4-prod-list">${top(g.noProductionJob, (o) => orderCard(o, 'Проверьте, нужно ли создать производственное задание'))}</div></section><section class="v4-prod-column"><h3>Заказы без задания на монтаж</h3><div class="v4-prod-list">${top(g.noInstallationJob, (o) => orderCard(o, 'Есть признаки монтажа, но монтажного задания не найдено'))}</div></section><section class="v4-prod-column"><h3>Просрочено</h3><div class="v4-prod-list">${top([...g.prodOverdue, ...g.instOverdue], (j) => j.production_status ? jobCard(j, 'production', 'Срок просрочен') : jobCard(j, 'installation', 'Монтаж просрочен'))}</div></section><section class="v4-prod-column"><h3>Ближайшие 1–3 дня</h3><div class="v4-prod-list">${top([...g.prodSoon, ...g.instSoon], (j) => j.production_status ? jobCard(j, 'production', 'Ближайший срок') : jobCard(j, 'installation', 'Ближайший монтаж'))}</div></section><section class="v4-prod-column"><h3>Проблемные задачи</h3><div class="v4-prod-list">${top([...g.prodProblems, ...g.instProblems], (j) => j.production_status ? jobCard(j, 'production', 'Проблема в производстве') : jobCard(j, 'installation', 'Проблема на монтаже'))}</div></section></div>`;
}
async function safeQuery(label, query) {
  try { const r = await timeout(query, 18000, `${label}: долгий ответ Supabase`); if (r.error) throw r.error; return r.data || []; }
  catch (e) { warnings.push(`${label} — ${friendlyError(e)}`); return []; }
}
async function loadData(force = false) {
  if (busy) return; if (loaded && !force) { render(); return; }
  busy = true; warnings = []; render();
  setStatus('Загружаю контроль производства...', 'warn');
  const [orders, production, installation] = await Promise.all([
    safeQuery('Заказы', supabaseClient.from('leader_orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).limit(100)),
    safeQuery('Производственные задания', supabaseClient.from('leader_production_jobs').select('*').order('deadline', { ascending: true }).limit(100)),
    safeQuery('Монтажные задания', supabaseClient.from('leader_installation_jobs').select('*').order('scheduled_at', { ascending: true }).limit(100))
  ]);
  state = { orders, production, installation }; loaded = true; busy = false;
  if (warnings.length) { toast('Контроль производства загружен частично'); setStatus('Контроль производства загружен частично', 'warn'); }
  else setStatus('Контроль производства загружен', 'good');
  render();
}
function showProductionControl() {
  ensureSection(); ensureNav(); document.body.dataset.v4Tab = 'production_control';
  document.querySelectorAll('[data-v4-tab-button]').forEach((b) => b.classList.toggle('is-active', b.dataset.v4TabButton === 'production_control'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((s) => { s.hidden = s.dataset.v4ManagedSection !== 'production_control'; });
  loadData(false); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function boot() {
  ensureSection(); ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => { setTimeout(ensureNav, 300); if (document.body.dataset.v4Tab === 'production_control') loadData(false); });
  document.addEventListener('leader-v4:tab-opened', (e) => { setTimeout(ensureNav, 150); if (e.detail?.tab === 'production_control' || document.body.dataset.v4Tab === 'production_control') loadData(false); });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="production_control"]'); if (tab) { event.preventDefault(); event.stopPropagation(); showProductionControl(); return; }
    if (event.target.closest?.('[data-production-control-refresh]')) { event.preventDefault(); loadData(true); return; }
    if (event.target.closest?.('[data-production-tab-open]')) { const setTab = window.v4SetTab; if (typeof setTab === 'function') setTab('production'); }
  }, true);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
