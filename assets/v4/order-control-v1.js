import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at,layout_status,data';
const CLOSED = new Set(['Готово', 'Выдано', 'Закрыт', 'Отменён', 'Отмена']);
let rows = [];
let loaded = false;
let busy = false;
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

function active(order) {
  return !CLOSED.has(order.status || 'Новый');
}

function unpaid(order) {
  const text = String(order.payment_status || '').toLowerCase();
  return !text || text.includes('не') || text.includes('част') || text.includes('долг') || text.includes('ожид');
}

function noLayout(order) {
  const text = String(order.layout_status || '').toLowerCase();
  return !text || text.includes('нет') || text.includes('нуж') || text.includes('ожид') || text.includes('не готов');
}

function productionStatus(order) {
  const text = String(order.status || '').toLowerCase();
  return text.includes('производ') || text.includes('работ') || text.includes('печать') || text.includes('монтаж');
}

function grouped() {
  const activeRows = rows.filter(active);
  return {
    active: activeRows,
    overdue: activeRows.filter((order) => daysUntil(order.deadline) !== null && daysUntil(order.deadline) < 0),
    today: activeRows.filter((order) => daysUntil(order.deadline) === 0),
    next3: activeRows.filter((order) => {
      const days = daysUntil(order.deadline);
      return days !== null && days > 0 && days <= 3;
    }),
    unpaid: activeRows.filter(unpaid),
    noLayout: activeRows.filter(noLayout),
    production: activeRows.filter(productionStatus),
    newOrders: activeRows.filter((order) => ['Новый', 'Создан', 'Принят'].includes(order.status || 'Новый'))
  };
}

function ensureStyles() {
  if (document.getElementById('orderControlV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderControlV1Styles';
  style.textContent = `
    .v4-order-control-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}.v4-order-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .v4-order-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-order-stat b{font-size:30px;line-height:1.1}.v4-order-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-order-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-order-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}
    .v4-order-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-order-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-order-actions .v4-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
    .v4-order-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}.v4-order-column{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px}.v4-order-column h3{margin:0 0 10px}.v4-order-list{display:grid;gap:10px}.v4-order-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-order-item.is-danger{border-color:#fecaca;background:#fff7f7}.v4-order-item.is-warn{border-color:#fde68a;background:#fffdf3}.v4-order-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-order-item h4{margin:0;font-size:15px}.v4-order-item small{color:#64748b}.v4-order-item button{justify-self:start;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
    @media(max-width:640px){.v4-order-column{border-radius:14px;padding:12px}.v4-order-actions button,.v4-order-item button{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  ensureStyles();
  let section = document.getElementById('orderControlSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'orderControlSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'order_control';
  section.hidden = true;
  section.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Контроль заказов</h2>
        <p>Сводка по заказам: сроки, оплата, макеты, производство и срочные задачи.</p>
      </div>
      <button type="button" class="v4-primary" data-order-control-refresh>Обновить заказы</button>
    </div>
    <div id="orderControlContent"><div class="v4-empty">Раздел загрузится при открытии.</div></div>
  `;
  const orderList = document.getElementById('ordersListSection');
  if (orderList) orderList.insertAdjacentElement('afterend', section);
  else (document.getElementById('crmWorkspace') || document.body).appendChild(section);
  return section;
}

function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="order_control"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="orders"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'order_control';
  button.textContent = 'Контроль заказов';
  if (anchor) anchor.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}

function stat(label, value, type = '') {
  return `<div class="v4-order-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function orderTitle(order) {
  return `№${order.order_number || String(order.id || '').slice(0, 8)} — ${order.project_name || 'Заказ'}`;
}

function card(order, note = '') {
  const days = daysUntil(order.deadline);
  const cls = days !== null && days < 0 ? 'is-danger' : days !== null && days <= 3 ? 'is-warn' : '';
  const deadlineText = days === null ? 'срок не указан' : days < 0 ? `просрочен на ${Math.abs(days)} дн.` : days === 0 ? 'сегодня' : `через ${days} дн.`;
  return `<article class="v4-order-item ${cls}">
    <div class="v4-order-item-head"><h4>${esc(orderTitle(order))}</h4><small>${esc(order.status || 'Новый')}</small></div>
    <small>${esc(order.client_name || 'Клиент не указан')} · ${esc(order.client_phone || 'телефон не указан')}</small>
    <small>Срок: ${dateRu(order.deadline)} (${esc(deadlineText)})</small>
    <small>Оплата: ${esc(order.payment_status || 'Не указана')} · Сумма: ${money(order.client_total)}</small>
    <small>Макет: ${esc(order.layout_status || 'Не указан')}</small>
    ${note ? `<small>${esc(note)}</small>` : ''}
    <button type="button" data-open-order="${esc(order.id)}">Открыть заказ</button>
  </article>`;
}

function top(list, mapper) {
  return list.slice(0, 6).map(mapper).join('') || '<div class="v4-empty">Нет заказов в этой группе.</div>';
}

function render() {
  ensureSection();
  const content = document.getElementById('orderControlContent');
  if (!content) return;
  if (busy) {
    content.innerHTML = '<div class="v4-empty">Загружаю заказы...</div>';
    return;
  }
  if (errorText) {
    content.innerHTML = `<div class="v4-empty is-error">${esc(errorText)}<div class="v4-form-actions" style="margin-top:12px"><button type="button" class="v4-primary" data-order-control-refresh>Повторить</button></div></div>`;
    return;
  }
  if (!loaded) {
    content.innerHTML = '<div class="v4-empty">Нажмите «Обновить заказы» или откройте раздел ещё раз.</div>';
    return;
  }
  const g = grouped();
  const total = rows.reduce((sum, order) => sum + Number(order.client_total || 0), 0);
  const activeTotal = g.active.reduce((sum, order) => sum + Number(order.client_total || 0), 0);
  content.innerHTML = `
    <div class="v4-order-control-grid">
      ${stat('Всего заказов', rows.length)}
      ${stat('Активные', g.active.length, g.active.length ? 'is-good' : '')}
      ${stat('Просрочены', g.overdue.length, g.overdue.length ? 'is-danger' : '')}
      ${stat('Срок сегодня', g.today.length, g.today.length ? 'is-warn' : '')}
      ${stat('Срок 1–3 дня', g.next3.length, g.next3.length ? 'is-warn' : '')}
      ${stat('Не оплачено / частично', g.unpaid.length, g.unpaid.length ? 'is-danger' : '')}
      ${stat('Макет не готов', g.noLayout.length, g.noLayout.length ? 'is-warn' : '')}
      ${stat('Активная сумма', money(activeTotal))}
    </div>
    <div class="v4-order-actions">
      <button type="button" class="v4-primary" data-order-tab-open>Открыть все заказы</button>
      <button type="button" data-order-control-refresh>Обновить</button>
    </div>
    <div class="v4-order-columns">
      <section class="v4-order-column"><h3>Просроченные сроки</h3><div class="v4-order-list">${top(g.overdue, (order) => card(order, 'Нужно срочно проверить производство / выдачу'))}</div></section>
      <section class="v4-order-column"><h3>Срок сегодня и 1–3 дня</h3><div class="v4-order-list">${top([...g.today, ...g.next3], (order) => card(order, 'Ближайший срок'))}</div></section>
      <section class="v4-order-column"><h3>Оплата под контролем</h3><div class="v4-order-list">${top(g.unpaid, (order) => card(order, 'Проверьте оплату перед производством / выдачей'))}</div></section>
      <section class="v4-order-column"><h3>Макеты и производство</h3><div class="v4-order-list">${top([...g.noLayout, ...g.production], (order) => card(order, noLayout(order) ? 'Макет не готов или требует проверки' : 'Заказ в производственном статусе'))}</div></section>
    </div>
  `;
}

async function loadOrders(force = false) {
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  errorText = '';
  render();
  try {
    setStatus('Загружаю контроль заказов...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).limit(150),
      30000,
      'Контроль заказов не загрузился за 30 секунд'
    );
    if (response.error) throw response.error;
    rows = response.data || [];
    loaded = true;
    setStatus('Контроль заказов загружен', 'good');
  } catch (error) {
    errorText = friendlyError(error);
    toast(errorText);
    setStatus(`Ошибка контроля заказов: ${errorText}`, 'error');
  } finally {
    busy = false;
    render();
  }
}

function showOrderControl() {
  ensureSection();
  ensureNav();
  document.body.dataset.v4Tab = 'order_control';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'order_control'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'order_control'; });
  loadOrders(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => {
    setTimeout(ensureNav, 300);
    if (document.body.dataset.v4Tab === 'order_control') loadOrders(false);
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    setTimeout(ensureNav, 150);
    if (event.detail?.tab === 'order_control' || document.body.dataset.v4Tab === 'order_control') loadOrders(false);
  });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="order_control"]');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      showOrderControl();
      return;
    }
    if (event.target.closest?.('[data-order-control-refresh]')) {
      event.preventDefault();
      loadOrders(true);
      return;
    }
    if (event.target.closest?.('[data-order-tab-open]')) {
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('orders');
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
