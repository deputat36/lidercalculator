import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status';
const CLOSED = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);

let busy = false;
let loaded = false;
let rows = [];
let warning = '';

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

function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('соглас') || text.includes('готов') || text.includes('создан') || text.includes('выдан') || text.includes('закры')) return 'is-good';
  if (text.includes('отказ') || text.includes('спам') || text.includes('отмен') || text.includes('проблем')) return 'is-danger';
  if (text.includes('жд') || text.includes('уточ') || text.includes('работ') || text.includes('отправ') || text.includes('производ')) return 'is-warn';
  return '';
}

function workspace() {
  return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body;
}

function ensureStyles() {
  if (document.getElementById('ordersFastLoaderV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'ordersFastLoaderV1Styles';
  style.textContent = `
    .v4-orders-fast-warning{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}
    .v4-orders-fast-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 12px}.v4-orders-fast-summary div{border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;padding:12px}.v4-orders-fast-summary span{display:block;color:#1d4ed8;font-size:12px;font-weight:900;text-transform:uppercase}.v4-orders-fast-summary b{display:block;margin-top:5px;font-size:22px;color:#0f172a}
    .v4-orders-fast-list{display:grid;gap:10px}.v4-orders-fast-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;display:grid;gap:8px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-orders-fast-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-orders-fast-head h3{margin:0;font-size:16px}.v4-orders-fast-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;color:#64748b}.v4-orders-fast-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-orders-fast-actions button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  let section = document.getElementById('ordersListSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'ordersListSection';
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = 'orders';
    section.innerHTML = `<div class="v4-section-head"><div><h2>Заказы</h2><p>Быстрый список заказов: статус, срок, клиент, сумма и оплата.</p></div><button type="button" class="v4-primary" data-orders-fast-refresh>Обновить</button></div><div id="ordersListSectionContent" class="v4-crm-list"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
    const catalog = document.getElementById('catalogSection');
    if (catalog?.parentNode) catalog.insertAdjacentElement('afterend', section);
    else workspace().appendChild(section);
  }
  section.dataset.v4ManagedSection = 'orders';
  return section;
}

function host() {
  ensureSection();
  return document.getElementById('ordersListSectionContent');
}

function showOrdersTab() {
  ensureSection();
  document.body.dataset.v4Tab = 'orders';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'orders'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'orders'; });
}

function render() {
  ensureStyles();
  const box = host();
  if (!box) return;
  const active = rows.filter((row) => !CLOSED.has(row.status || '')).length;
  const total = rows.reduce((sum, row) => sum + Number(row.client_total || 0), 0);
  const unpaid = rows.filter((row) => {
    const text = String(row.payment_status || '').toLowerCase();
    return !text || text.includes('не') || text.includes('част') || text.includes('долг') || text.includes('ожид');
  }).length;
  const warningHtml = warning ? `<div class="v4-orders-fast-warning">${esc(warning)}. Можно повторить загрузку или открыть «Контроль заказов».</div>` : '';
  box.innerHTML = `${warningHtml}<div class="v4-orders-fast-summary"><div><span>Заказов</span><b>${rows.length}</b></div><div><span>Активные</span><b>${active}</b></div><div><span>Сумма</span><b>${money(total)}</b></div><div><span>Оплата под контролем</span><b>${unpaid}</b></div></div><div class="v4-orders-fast-list">${rows.length ? rows.map((order) => `<article class="v4-orders-fast-card"><div class="v4-orders-fast-head"><h3>№${esc(order.order_number || String(order.id || '').slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h3><span class="v4-crm-badge ${statusClass(order.status)}">${esc(order.status || 'Новый')}</span></div><div class="v4-orders-fast-meta"><span><b>Клиент:</b> ${esc(order.client_name || '—')}</span><span><b>Телефон:</b> ${esc(order.client_phone || '—')}</span><span><b>Срок:</b> ${dateRu(order.deadline)}</span><span><b>Оплата:</b> ${esc(order.payment_status || 'Не указана')}</span><span><b>Сумма:</b> ${money(order.client_total)}</span><span><b>Макет:</b> ${esc(order.layout_status || '—')}</span></div><div class="v4-orders-fast-actions"><button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button></div></article>`).join('') : '<div class="v4-empty">Заказов пока нет или они не загрузились.</div>'}</div>`;
}

async function loadOrdersFast(force = false) {
  ensureSection();
  ensureStyles();
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  warning = '';
  const box = host();
  if (box) box.innerHTML = '<div class="v4-empty">Загружаю быстрый список заказов...</div>';
  try {
    const response = await supabaseClient
      .from('leader_orders')
      .select(ORDER_FIELDS)
      .order('created_at', { ascending: false })
      .limit(40);
    if (response.error) throw response.error;
    rows = response.data || [];
  } catch (error) {
    rows = [];
    warning = `Заказы не загрузились: ${friendlyError(error)}`;
  } finally {
    loaded = true;
    busy = false;
    render();
  }
}

function boot() {
  ensureSection();
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="orders"]');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showOrdersTab();
      loadOrdersFast(false);
      return;
    }
    if (event.target.closest?.('[data-orders-fast-refresh],[data-v4-list-refresh="orders"]')) {
      event.preventDefault();
      loaded = false;
      loadOrdersFast(true);
    }
  }, true);
}

if (!window.LeaderV4OrdersFastLoaderV1Booted) {
  window.LeaderV4OrdersFastLoaderV1Booted = true;
  boot();
}

export { loadOrdersFast };
