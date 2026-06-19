import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

const FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,contractor_cost,profit,payment_status,created_at,layout_status,data';
const CLOSED = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);
let rows = [];
let warnings = [];
let busy = false;
let loaded = false;

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function money(value) { const n = Number(value || 0); return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—'; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); } }
function dataOf(order) { if (!order?.data) return {}; if (typeof order.data === 'object') return order.data; try { return JSON.parse(order.data); } catch (_) { return {}; } }
function num(value) { const n = Number(value || 0); return Number.isFinite(n) ? n : 0; }
function clientTotal(order) { const d = dataOf(order); return num(order.client_total || d.client_total || d.clientTotal || d.total_client || d.totalClient || d.total); }
function costTotal(order) { const d = dataOf(order); return num(order.contractor_cost || d.contractor_cost || d.contractorCost || d.cost_total || d.costTotal || d.contractor_total || d.contractorTotal); }
function profitTotal(order) { const p = num(order.profit || dataOf(order).profit); return p || (clientTotal(order) - costTotal(order)); }
function marginPercent(order) { const total = clientTotal(order); return total ? Math.round((profitTotal(order) / total) * 100) : null; }
function active(order) { return !CLOSED.has(order.status || 'Новый'); }
function paymentText(order) { return String(order.payment_status || dataOf(order).payment_status || dataOf(order).paymentStatus || '').trim(); }
function unpaid(order) { const t = paymentText(order).toLowerCase(); return !t || t.includes('не') || t.includes('част') || t.includes('долг') || t.includes('ожид') || t.includes('без оплат'); }
function noCost(order) { return clientTotal(order) > 0 && costTotal(order) <= 0; }
function lowMargin(order) { const m = marginPercent(order); return m !== null && m < 25; }
function grouped() {
  const activeRows = rows.filter(active);
  return {
    active: activeRows,
    unpaid: activeRows.filter(unpaid),
    noCost: activeRows.filter(noCost),
    lowMargin: activeRows.filter(lowMargin),
    risky: activeRows.filter((o) => unpaid(o) || noCost(o) || lowMargin(o))
  };
}
function ensureStyles() {
  if (document.getElementById('financeControlV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'financeControlV2Styles';
  style.textContent = `.v4-fin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}.v4-fin-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-fin-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-fin-stat b{font-size:24px;line-height:1.15}.v4-fin-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-fin-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-fin-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-fin-warnings{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}.v4-fin-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-fin-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-fin-actions .v4-primary{background:#0f172a;border-color:#0f172a;color:#fff}.v4-fin-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}.v4-fin-column{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px}.v4-fin-column h3{margin:0 0 10px}.v4-fin-list{display:grid;gap:10px}.v4-fin-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-fin-item.is-danger{border-color:#fecaca;background:#fff7f7}.v4-fin-item.is-warn{border-color:#fde68a;background:#fffdf3}.v4-fin-item-head{display:flex;justify-content:space-between;gap:10px}.v4-fin-item h4{margin:0;font-size:15px}.v4-fin-item small{color:#64748b}.v4-fin-item button{justify-self:start;border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;padding:8px 10px;font-weight:900}`;
  document.head.appendChild(style);
}
function ensureSection() {
  ensureStyles();
  let section = document.getElementById('financeControlSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'financeControlSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'finance_control';
  section.hidden = true;
  section.innerHTML = `<div class="v4-section-head"><div><h2>Финансовый контроль</h2><p>Контроль оплат, суммы активных заказов, себестоимости, прибыли и заказов с финансовыми рисками.</p></div><button type="button" class="v4-primary" data-finance-control-refresh>Обновить финансы</button></div><div id="financeControlContent"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
  (document.getElementById('crmWorkspace') || document.body).appendChild(section);
  return section;
}
function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="finance_control"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="order_control"]') || nav.querySelector('[data-v4-tab-button="orders"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'finance_control';
  button.textContent = 'Финансы';
  if (anchor) anchor.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}
function stat(label, value, type = '') { return `<div class="v4-fin-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`; }
function title(order) { return `№${order.order_number || String(order.id || '').slice(0, 8)} — ${order.project_name || 'Заказ'}`; }
function card(order, note = '', type = '') {
  const margin = marginPercent(order);
  return `<article class="v4-fin-item ${type}"><div class="v4-fin-item-head"><h4>${esc(title(order))}</h4><small>${esc(order.status || 'Новый')}</small></div><small>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</small><small>Оплата: ${esc(paymentText(order) || 'Не указана')} · Срок: ${dateRu(order.deadline)}</small><small>Клиенту: ${money(clientTotal(order))} · Себестоимость: ${money(costTotal(order))} · Прибыль: ${money(profitTotal(order))}${margin !== null ? ` · Маржа: ${margin}%` : ''}</small>${note ? `<small>${esc(note)}</small>` : ''}<button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button></article>`;
}
function top(list, mapper) { return list.slice(0, 7).map(mapper).join('') || '<div class="v4-empty">Нет заказов в этой группе.</div>'; }
function render() {
  ensureSection();
  const content = document.getElementById('financeControlContent');
  if (!content) return;
  if (busy) { content.innerHTML = '<div class="v4-empty">Загружаю финансовый контроль...</div>'; return; }
  if (!loaded) { content.innerHTML = '<div class="v4-empty">Нажмите «Обновить финансы» или откройте раздел ещё раз.</div>'; return; }
  const g = grouped();
  const activeTotal = g.active.reduce((s, o) => s + clientTotal(o), 0);
  const activeCost = g.active.reduce((s, o) => s + costTotal(o), 0);
  const activeProfit = g.active.reduce((s, o) => s + profitTotal(o), 0);
  const unpaidTotal = g.unpaid.reduce((s, o) => s + clientTotal(o), 0);
  const margin = activeTotal ? Math.round((activeProfit / activeTotal) * 100) : 0;
  const warn = warnings.length ? `<div class="v4-fin-warnings">${warnings.map(esc).join('; ')}. Раздел показан в частичном режиме.</div>` : '';
  content.innerHTML = `${warn}<div class="v4-fin-grid">${stat('Активных заказов', g.active.length)}${stat('Активная сумма', money(activeTotal), activeTotal ? 'is-good' : '')}${stat('Себестоимость', money(activeCost))}${stat('Потенц. прибыль', money(activeProfit), activeProfit > 0 ? 'is-good' : 'is-warn')}${stat('Средняя маржа', `${margin}%`, margin < 25 && activeTotal ? 'is-danger' : 'is-good')}${stat('Не оплачено / частично', g.unpaid.length, g.unpaid.length ? 'is-danger' : '')}${stat('Сумма к контролю оплаты', money(unpaidTotal), unpaidTotal ? 'is-danger' : '')}${stat('Без себестоимости', g.noCost.length, g.noCost.length ? 'is-warn' : '')}${stat('Низкая маржа', g.lowMargin.length, g.lowMargin.length ? 'is-danger' : '')}</div><div class="v4-fin-actions"><button type="button" class="v4-primary" data-order-tab-open>Открыть все заказы</button><button type="button" data-finance-control-refresh>Обновить</button></div><div class="v4-fin-columns"><section class="v4-fin-column"><h3>Оплата под контролем</h3><div class="v4-fin-list">${top(g.unpaid, (o) => card(o, 'Проверьте оплату.', 'is-danger'))}</div></section><section class="v4-fin-column"><h3>Без себестоимости</h3><div class="v4-fin-list">${top(g.noCost, (o) => card(o, 'Себестоимость не заполнена.', 'is-warn'))}</div></section><section class="v4-fin-column"><h3>Низкая маржа</h3><div class="v4-fin-list">${top(g.lowMargin, (o) => card(o, 'Маржа ниже 25%.', 'is-danger'))}</div></section><section class="v4-fin-column"><h3>Финансовые риски</h3><div class="v4-fin-list">${top(g.risky, (o) => card(o, 'Есть финансовый риск.', 'is-warn'))}</div></section></div>`;
}
async function loadData(force = false) {
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  warnings = [];
  render();
  try {
    setStatus('Загружаю финансовый контроль...', 'warn');
    const response = await supabaseClient.from('leader_orders').select(FIELDS).order('created_at', { ascending: false }).limit(60);
    if (response.error) throw response.error;
    rows = response.data || [];
    setStatus('Финансовый контроль загружен', 'good');
  } catch (error) {
    rows = [];
    warnings.push(`Заказы/финансы — ${friendlyError(error)}`);
    toast('Финансовый контроль загружен частично');
    setStatus('Финансовый контроль загружен частично', 'warn');
  } finally {
    loaded = true;
    busy = false;
    render();
  }
}
function showFinanceControl() {
  ensureSection();
  ensureNav();
  document.body.dataset.v4Tab = 'finance_control';
  document.querySelectorAll('[data-v4-tab-button]').forEach((b) => b.classList.toggle('is-active', b.dataset.v4TabButton === 'finance_control'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((s) => { s.hidden = s.dataset.v4ManagedSection !== 'finance_control'; });
  loadData(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => { setTimeout(ensureNav, 300); if (document.body.dataset.v4Tab === 'finance_control') loadData(false); });
  document.addEventListener('leader-v4:tab-opened', (e) => { setTimeout(ensureNav, 150); if (e.detail?.tab === 'finance_control' || document.body.dataset.v4Tab === 'finance_control') loadData(false); });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="finance_control"]');
    if (tab) { event.preventDefault(); event.stopPropagation(); showFinanceControl(); return; }
    if (event.target.closest?.('[data-finance-control-refresh]')) { event.preventDefault(); loadData(true); return; }
    if (event.target.closest?.('[data-order-tab-open]')) { const setTab = window.v4SetTab; if (typeof setTab === 'function') setTab('orders'); }
  }, true);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
