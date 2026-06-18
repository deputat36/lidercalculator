import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

let running = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const dt = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } };

function ensureStyles() {
  if (document.getElementById('productionDiagnosticsV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionDiagnosticsV1Styles';
  style.textContent = `
    .v4-production-diagnostics{border:1px solid #bae6fd;background:#f0f9ff;border-radius:18px;padding:12px;margin:12px 0;color:#075985}.v4-production-diagnostics h3{margin:0 0 8px}.v4-production-diagnostics p{margin:0 0 10px;font-weight:800}.v4-production-diagnostics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.v4-production-diagnostic-card{border:1px solid #e0f2fe;background:#fff;border-radius:14px;padding:10px}.v4-production-diagnostic-card b{display:block;margin-bottom:5px}.v4-production-diagnostic-card span{display:block;color:#475569;font-size:13px}.v4-production-diagnostic-card.is-good{border-color:#86efac;background:#f0fdf4}.v4-production-diagnostic-card.is-warn{border-color:#fde68a;background:#fffbeb}.v4-production-diagnostic-card.is-error{border-color:#fecaca;background:#fef2f2;color:#991b1b}.v4-production-diagnostics-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-production-diagnostics-actions button{background:#fff}.v4-production-diagnostics-actions .v4-primary{background:#0284c7;color:#fff;border-color:#0284c7}@media(max-width:720px){.v4-production-diagnostics-actions{display:grid}.v4-production-diagnostics-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function boardContent() {
  return document.getElementById('productionBoardSectionContent') || document.getElementById('productionBoardSection');
}

function statusClass(error, count) {
  if (error) return 'is-error';
  if (!count) return 'is-warn';
  return 'is-good';
}

function row(label, result, hint = '') {
  const count = Array.isArray(result.data) ? result.data.length : 0;
  const error = result.error;
  return `<div class="v4-production-diagnostic-card ${statusClass(error, count)}"><b>${esc(label)}</b><span>${error ? `Ошибка: ${esc(friendlyError(error))}` : `Видно записей: ${count}`}</span>${hint ? `<span>${esc(hint)}</span>` : ''}</div>`;
}

async function read(table, columns = 'id,created_at') {
  try {
    const response = await supabaseClient.from(table).select(columns).limit(200);
    return response;
  } catch (error) {
    return { data: [], error };
  }
}

function metrics(results) {
  const production = results.production.data || [];
  const installation = results.installation.data || [];
  const today = new Date().toISOString().slice(0, 10);
  const prodOverdue = production.filter((job) => job.deadline && new Date(job.deadline) < new Date() && !['Готово', 'Выдано', 'Закрыто', 'Отменено'].includes(job.production_status || '')).length;
  const installOverdue = installation.filter((job) => job.scheduled_at && new Date(job.scheduled_at) < new Date() && !['Выполнен', 'Закрыт', 'Отменено', 'Отменён'].includes(job.install_status || '')).length;
  const prodToday = production.filter((job) => String(job.deadline || '').slice(0, 10) === today).length;
  const installToday = installation.filter((job) => String(job.scheduled_at || '').slice(0, 10) === today).length;
  return { prodOverdue, installOverdue, prodToday, installToday };
}

function renderResults(results) {
  const host = document.getElementById('productionDiagnosticsBox');
  if (!host) return;
  const m = metrics(results);
  host.innerHTML = `<h3>Диагностика производства</h3><p>Проверка чтения основных таблиц и быстрых показателей для текущего пользователя.</p><div class="v4-production-diagnostics-grid">${row('Заказы', results.orders, 'leader_orders')}${row('Позиции заказов', results.orderItems, 'leader_order_items')}${row('Производственные задания', results.production, `Просрочено: ${m.prodOverdue}, сегодня: ${m.prodToday}`)}${row('Позиции производства', results.productionItems, 'leader_production_job_items')}${row('Монтажные задания', results.installation, `Просрочено: ${m.installOverdue}, сегодня: ${m.installToday}`)}${row('Позиции монтажа', results.installationItems, 'leader_installation_job_items')}${row('События производства', results.productionEvents, 'не критично для сохранения')}${row('События монтажа', results.installationEvents, 'не критично для сохранения')}</div><div class="v4-production-diagnostics-actions"><button type="button" class="v4-primary" data-run-production-diagnostics>Проверить ещё раз</button><button type="button" data-close-production-diagnostics>Скрыть диагностику</button></div><p style="margin-top:10px;color:#475569">Последняя проверка: ${dt(new Date())}</p>`;
}

function ensureBox() {
  ensureStyles();
  const content = boardContent();
  if (!content) return null;
  let box = document.getElementById('productionDiagnosticsBox');
  if (!box) {
    box = document.createElement('section');
    box.id = 'productionDiagnosticsBox';
    box.className = 'v4-production-diagnostics';
    const board = content.querySelector('.v4-production-board');
    if (board) board.insertAdjacentElement('afterbegin', box);
    else content.insertAdjacentElement('afterbegin', box);
  }
  return box;
}

async function runDiagnostics() {
  if (running) return;
  running = true;
  try {
    const box = ensureBox();
    if (!box) return;
    box.innerHTML = '<h3>Диагностика производства</h3><p>Проверяю таблицы...</p>';
    setStatus('Проверяю производственные таблицы...', 'warn');
    const [orders, orderItems, production, productionItems, installation, installationItems, productionEvents, installationEvents] = await Promise.all([
      read('leader_orders', 'id,order_number,status,deadline,created_at'),
      read('leader_order_items', 'id,order_id,name,created_at'),
      read('leader_production_jobs', 'id,order_id,production_status,deadline,created_at'),
      read('leader_production_job_items', 'id,job_id,order_id,name,created_at'),
      read('leader_installation_jobs', 'id,order_id,install_status,scheduled_at,created_at'),
      read('leader_installation_job_items', 'id,job_id,order_id,name,created_at'),
      read('leader_production_events', 'id,job_id,order_id,event_type,created_at'),
      read('leader_installation_events', 'id,job_id,order_id,event_type,created_at')
    ]);
    renderResults({ orders, orderItems, production, productionItems, installation, installationItems, productionEvents, installationEvents });
    setStatus('Диагностика производства выполнена', 'good');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка диагностики: ${friendlyError(error)}`, 'error');
  } finally {
    running = false;
  }
}

function addButton() {
  ensureStyles();
  const actions = document.querySelector('.v4-production-board-actions');
  if (!actions || actions.querySelector('[data-run-production-diagnostics]')) return;
  actions.insertAdjacentHTML('beforeend', '<button type="button" data-run-production-diagnostics>Диагностика</button>');
}

function boot() {
  document.addEventListener('click', (event) => {
    const run = event.target.closest?.('[data-run-production-diagnostics]');
    if (run) {
      event.preventDefault();
      runDiagnostics();
      return;
    }
    const close = event.target.closest?.('[data-close-production-diagnostics]');
    if (close) {
      event.preventDefault();
      document.getElementById('productionDiagnosticsBox')?.remove();
    }
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'production') setTimeout(addButton, 800);
  });
  new MutationObserver(addButton).observe(document.body, { childList: true, subtree: true });
  setTimeout(addButton, 1200);
}

if (!window.LeaderV4ProductionDiagnosticsV1Booted) {
  window.LeaderV4ProductionDiagnosticsV1Booted = true;
  boot();
}
