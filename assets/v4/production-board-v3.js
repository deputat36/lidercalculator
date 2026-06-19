import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';

let busy = false;
let loaded = false;
let state = { production: [], installation: [], orders: new Map(), warning: '' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}
function shortId(value) { return String(value || '').slice(0, 8); }
function doneProduction(status) {
  const text = String(status || '').toLowerCase();
  return text.includes('готов') || text.includes('выдан') || text.includes('закры') || text.includes('отмен');
}
function doneInstall(status) {
  const text = String(status || '').toLowerCase();
  return text.includes('выполн') || text.includes('закры') || text.includes('отмен');
}
function isOverdue(value, done) {
  if (done || !value) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  date.setHours(23, 59, 59, 999);
  return date.getTime() < Date.now();
}

function ensureStyles() {
  if (document.getElementById('productionBoardV3LightStyles')) return;
  const style = document.createElement('style');
  style.id = 'productionBoardV3LightStyles';
  style.textContent = `
    .v4-prod-light{display:grid;gap:14px}.v4-prod-light-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v4-prod-light-head h2{margin:0}.v4-prod-light-head p{margin:6px 0 0;color:#64748b}.v4-prod-light-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-prod-light-actions button{border:1px solid #16a34a;background:#16a34a;color:#fff;border-radius:12px;padding:9px 12px;font-weight:900}.v4-prod-light-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.v4-prod-light-summary div{border:1px solid #d1fae5;background:#f0fdf4;border-radius:16px;padding:12px}.v4-prod-light-summary span{display:block;color:#166534;font-size:12px;font-weight:900;text-transform:uppercase}.v4-prod-light-summary b{display:block;margin-top:5px;font-size:22px}.v4-prod-light-warning{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;font-weight:800}.v4-prod-light-tabs{display:flex;gap:8px;flex-wrap:wrap}.v4-prod-light-tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:8px 12px;font-weight:900}.v4-prod-light-tabs button.is-active{background:#16a34a;border-color:#16a34a;color:#fff}.v4-prod-light-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}.v4-prod-light-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;display:grid;gap:6px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-prod-light-card.is-overdue{border-color:#fecaca;background:#fff7f7}.v4-prod-light-card h3{margin:0;font-size:16px}.v4-prod-light-card small{color:#64748b}.v4-prod-light-badge{display:inline-flex;width:max-content;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-size:12px;font-weight:900}.v4-prod-light-badge.is-warn{background:#fef3c7;color:#92400e}.v4-prod-light-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-prod-light-card button{justify-self:start;border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:12px;padding:8px 10px;font-weight:900}
    @media(max-width:640px){.v4-prod-light-head{display:grid}.v4-prod-light-actions button,.v4-prod-light-card button{width:100%}}
  `;
  document.head.appendChild(style);
}

function workspace() { return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body; }
function ensureSection() {
  let section = document.getElementById('productionBoardSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'productionBoardSection';
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = 'production';
    section.innerHTML = '<div id="productionBoardSectionContent"><div class="v4-empty">Раздел производства загрузится при открытии.</div></div>';
    workspace().appendChild(section);
  }
  section.dataset.v4ManagedSection = 'production';
  return section;
}
function content() {
  ensureSection();
  return document.getElementById('productionBoardSectionContent');
}
function showProductionTab() {
  ensureSection();
  document.body.dataset.v4Tab = 'production';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'production'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'production'; });
}
async function safeQuery(label, query) {
  try {
    const response = await query;
    if (response.error) throw response.error;
    return response.data || [];
  } catch (error) {
    state.warning = [state.warning, `${label}: ${friendlyError(error)}`].filter(Boolean).join('; ');
    return [];
  }
}
async function fetchData() {
  state.warning = '';
  const [production, installation] = await Promise.all([
    safeQuery('Производство', supabaseClient.from('leader_production_jobs').select('id,order_id,title,production_status,deadline,layout_status,file_url,contractor_cost').order('deadline', { ascending: true }).limit(60)),
    safeQuery('Монтаж', supabaseClient.from('leader_installation_jobs').select('id,order_id,title,install_status,scheduled_at,address,installer_name').order('scheduled_at', { ascending: true }).limit(60))
  ]);
  const ids = [...new Set([...production, ...installation].map((job) => job.order_id).filter(Boolean))];
  let orders = [];
  if (ids.length) {
    orders = await safeQuery('Заказы', supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,layout_status,client_total,contractor_cost,data').in('id', ids).limit(80));
  }
  state = { ...state, production, installation, orders: new Map(orders.map((order) => [order.id, order])) };
}
function badgeClass(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('проблем') || value.includes('срыв') || value.includes('передел') || value.includes('отмен')) return 'is-danger';
  if (value.includes('работ') || value.includes('передан') || value.includes('заплан') || value.includes('назнач')) return 'is-warn';
  return '';
}
function card(job, kind) {
  const order = state.orders.get(job.order_id);
  const status = kind === 'production' ? job.production_status : job.install_status;
  const date = kind === 'production' ? job.deadline : job.scheduled_at;
  const overdue = kind === 'production' ? isOverdue(date, doneProduction(status)) : isOverdue(date, doneInstall(status));
  return `<article class="v4-prod-light-card ${overdue ? 'is-overdue' : ''}"><span class="v4-prod-light-badge ${badgeClass(status)}">${esc(status || 'Без статуса')}</span><h3>${esc(job.title || order?.project_name || 'Задание')}</h3><small>Заказ: №${esc(order?.order_number || shortId(job.order_id))} — ${esc(order?.project_name || '—')}</small><small>${kind === 'production' ? 'Срок производства' : 'Дата монтажа'}: ${dateRu(date)}</small>${kind === 'production' ? `<small>Макет: ${esc(job.layout_status || order?.layout_status || '—')}</small>` : `<small>Адрес: ${esc(job.address || order?.data?.install_place || '—')}</small><small>Монтажник: ${esc(job.installer_name || '—')}</small>`}${overdue ? '<small style="color:#991b1b;font-weight:900">Просрочено</small>' : ''}<button type="button" data-open-order="${esc(job.order_id)}">Открыть заказ</button></article>`;
}
function render(kind = document.body.dataset.productionBoardKind || 'production') {
  ensureStyles();
  const box = content();
  if (!box) return;
  const productionOpen = state.production.filter((job) => !doneProduction(job.production_status)).length;
  const installationOpen = state.installation.filter((job) => !doneInstall(job.install_status)).length;
  const overdueCount = state.production.filter((job) => isOverdue(job.deadline, doneProduction(job.production_status))).length + state.installation.filter((job) => isOverdue(job.scheduled_at, doneInstall(job.install_status))).length;
  const items = kind === 'installation' ? state.installation : state.production;
  box.innerHTML = `<div class="v4-prod-light"><div class="v4-prod-light-head"><div><p class="v4-kicker">Быстрая производственная доска</p><h2>Производство и монтаж</h2><p>Облегчённая загрузка без select(*) и без отдельных запросов по каждому заказу.</p></div><div class="v4-prod-light-actions"><button type="button" data-production-light-refresh>Обновить</button></div></div>${state.warning ? `<div class="v4-prod-light-warning">Часть данных не загрузилась: ${esc(state.warning)}</div>` : ''}<div class="v4-prod-light-summary"><div><span>Производственных</span><b>${state.production.length}</b></div><div><span>Производство открыто</span><b>${productionOpen}</b></div><div><span>Монтажей</span><b>${state.installation.length}</b></div><div><span>Монтаж открыт</span><b>${installationOpen}</b></div><div><span>Просрочено</span><b>${overdueCount}</b></div></div><div class="v4-prod-light-tabs"><button type="button" class="${kind === 'production' ? 'is-active' : ''}" data-production-light-kind="production">Производство</button><button type="button" class="${kind === 'installation' ? 'is-active' : ''}" data-production-light-kind="installation">Монтаж</button></div><div class="v4-prod-light-grid">${items.length ? items.map((job) => card(job, kind)).join('') : '<div class="v4-empty">Заданий в этой группе нет.</div>'}</div></div>`;
}
async function loadProductionBoard(force = false) {
  ensureSection();
  ensureStyles();
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  const box = content();
  if (box) box.innerHTML = '<div class="v4-empty">Загружаю облегчённую производственную доску...</div>';
  try {
    await fetchData();
    loaded = true;
    render();
  } finally {
    busy = false;
  }
}
function openProduction() {
  showProductionTab();
  loadProductionBoard(false);
}
function boot() {
  ensureSection();
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="production"]');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openProduction();
      return;
    }
    if (event.target.closest?.('[data-production-light-refresh]')) {
      event.preventDefault();
      loaded = false;
      loadProductionBoard(true);
      return;
    }
    const kind = event.target.closest?.('[data-production-light-kind]');
    if (kind) {
      event.preventDefault();
      document.body.dataset.productionBoardKind = kind.dataset.productionLightKind;
      render(kind.dataset.productionLightKind);
    }
  }, true);
  document.addEventListener('leader-v4:tab-opened', (event) => { if (event.detail?.tab === 'production') loadProductionBoard(false); });
  window.addEventListener('leader-v4:force-tab', (event) => { if (event.detail?.tab === 'production') openProduction(); });
  if (document.body.dataset.v4Tab === 'production') setTimeout(() => loadProductionBoard(false), 250);
}
if (!window.LeaderV4ProductionBoardV3Booted) {
  window.LeaderV4ProductionBoardV3Booted = true;
  boot();
}
export { loadProductionBoard };
