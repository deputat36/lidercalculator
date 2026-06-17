import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

let booted = false;
let busy = false;
let loaded = false;
let lastData = { production: [], installation: [], orders: new Map() };

const PRODUCTION_COLUMNS = [
  { key: 'not_sent', title: 'Не передано', match: ['Не передано', 'Макет не проверен', 'Макет не начат'] },
  { key: 'in_work', title: 'В работе', match: ['Передано в производство', 'В работе', 'Печать', 'Резка', 'Сборка'] },
  { key: 'ready', title: 'Готово', match: ['Готово', 'Готов к выдаче'] },
  { key: 'problem', title: 'Проблемы', match: ['Проблема', 'Срыв', 'Переделка', 'Отменено'] }
];
const INSTALL_COLUMNS = [
  { key: 'need', title: 'Нужно назначить', match: ['Нужно назначить', 'Не назначен'] },
  { key: 'planned', title: 'Запланирован', match: ['Запланирован', 'Назначен'] },
  { key: 'work', title: 'В работе', match: ['В работе', 'Выезд', 'На объекте'] },
  { key: 'done', title: 'Выполнен', match: ['Выполнен', 'Принят', 'Закрыт'] }
];

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
function nowIso() { return new Date().toISOString(); }
function isOverdue(value) {
  if (!value) return false;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return false;
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now();
}
function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('готов') || text.includes('выполн') || text.includes('принят') || text.includes('закры')) return 'is-good';
  if (text.includes('проблем') || text.includes('срыв') || text.includes('передел') || text.includes('отмен')) return 'is-danger';
  if (text.includes('работ') || text.includes('передано') || text.includes('заплан') || text.includes('назнач')) return 'is-warn';
  return '';
}
function colFor(status, cols) {
  const text = String(status || '').toLowerCase();
  return cols.find((col) => col.match.some((item) => text.includes(item.toLowerCase()))) || cols[0];
}
function ensureStyles() {
  if (document.getElementById('productionBoardV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionBoardV1Styles';
  style.textContent = `
    .v4-production-board{display:grid;gap:14px}.v4-production-board-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.v4-production-board-head h2{margin:0}.v4-production-board-head p{margin:6px 0 0;color:#64748b}.v4-production-board-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-production-board-actions button{background:#fff}.v4-production-board-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.v4-production-board-summary div{border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;padding:12px}.v4-production-board-summary span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#1d4ed8}.v4-production-board-summary b{display:block;margin-top:5px;font-size:20px;color:#0f172a}.v4-production-board-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:18px;padding:12px}.v4-production-board-tabs{display:flex;gap:8px;flex-wrap:wrap}.v4-production-board-tabs button.is-active{background:#16a34a;border-color:#16a34a;color:#fff}.v4-production-columns{display:grid;grid-template-columns:repeat(4,minmax(230px,1fr));gap:12px;overflow-x:auto;padding-bottom:4px}.v4-production-column{border:1px solid #d1fae5;background:#f0fdf4;border-radius:18px;padding:10px;min-width:230px}.v4-production-column h3{margin:0 0 8px;color:#166534;display:flex;justify-content:space-between;gap:8px}.v4-production-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;margin:10px 0;box-shadow:0 8px 22px rgba(15,23,42,.06)}.v4-production-card.is-overdue{border-color:#fecaca;background:#fff7f7}.v4-production-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-production-card-head b{overflow-wrap:anywhere}.v4-production-badge{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-size:12px;font-weight:900;white-space:nowrap}.v4-production-badge.is-warn{background:#fef3c7;color:#92400e}.v4-production-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-production-badge.is-good{background:#dcfce7;color:#166534}.v4-production-meta{display:grid;gap:4px;margin:8px 0;color:#475569;font-size:13px}.v4-production-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.v4-production-card-actions button{font-size:12px;padding:7px 9px;background:#f8fafc}.v4-production-card-actions .v4-primary{background:#16a34a;color:#fff;border-color:#16a34a}.v4-production-empty{border:1px dashed #86efac;border-radius:14px;padding:12px;background:#fff;color:#166534;font-weight:800}.v4-production-link{display:inline-flex;margin-top:5px;font-weight:900;color:#166534;overflow-wrap:anywhere}
    @media(max-width:920px){.v4-production-board-head{display:grid}.v4-production-board-actions{display:grid}.v4-production-board-actions button{width:100%}.v4-production-columns{grid-template-columns:repeat(4,260px)}}
  `;
  document.head.appendChild(style);
}
function ensureSection() {
  let section = document.getElementById('productionBoardSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'productionBoardSection';
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = 'production';
    section.innerHTML = '<div id="productionBoardSectionContent"><div class="v4-empty">Раздел производства загружается...</div></div>';
    const orders = document.getElementById('ordersListSection');
    if (orders?.parentNode) orders.insertAdjacentElement('afterend', section);
    else document.getElementById('crmWorkspace')?.appendChild(section);
  }
  section.dataset.v4ManagedSection = 'production';
  return section;
}
function ensureMenuButton() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="production"]')) return;
  const orders = nav.querySelector('[data-v4-tab-button="orders"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'production';
  button.textContent = 'Производство';
  if (orders) orders.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}
function content() {
  ensureSection();
  return document.getElementById('productionBoardSectionContent');
}
async function fetchData() {
  const [productionResponse, installationResponse] = await Promise.all([
    supabaseClient.from('leader_production_jobs').select('*').order('deadline', { ascending: true, nullsFirst: false }).limit(150),
    supabaseClient.from('leader_installation_jobs').select('*').order('scheduled_at', { ascending: true, nullsFirst: false }).limit(150)
  ]);
  if (productionResponse.error) throw productionResponse.error;
  if (installationResponse.error) throw installationResponse.error;
  const production = productionResponse.data || [];
  const installation = installationResponse.data || [];
  const orderIds = [...new Set([...production.map((job) => job.order_id), ...installation.map((job) => job.order_id)].filter(Boolean))];
  const orders = new Map();
  if (orderIds.length) {
    const orderResponse = await supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,layout_status,production_status,installation_status,progress_percent,client_total,contractor_cost,layout_link,data').in('id', orderIds);
    if (!orderResponse.error) (orderResponse.data || []).forEach((order) => orders.set(order.id, order));
  }
  lastData = { production, installation, orders };
  return lastData;
}
function matchesSearch(job, order, query) {
  if (!query) return true;
  const text = [job.title, job.production_status, job.layout_status, job.install_status, job.installer_name, job.address, order?.project_name, order?.order_number, order?.status].filter(Boolean).join(' ').toLowerCase();
  return text.includes(query.toLowerCase());
}
function renderCard(job, kind, order) {
  const status = kind === 'production' ? job.production_status : job.install_status;
  const date = kind === 'production' ? (job.deadline || order?.deadline) : job.scheduled_at;
  const overdue = isOverdue(date) && !String(status || '').toLowerCase().includes('готов') && !String(status || '').toLowerCase().includes('выполн');
  const file = kind === 'production' ? job.file_url : (job.before_photo_url || job.after_photo_url);
  return `<article class="v4-production-card ${overdue ? 'is-overdue' : ''}"><div class="v4-production-card-head"><b>${esc(job.title || order?.project_name || 'Задание')}</b><span class="v4-production-badge ${statusClass(status)}">${esc(status || '—')}</span></div><div class="v4-production-meta"><span>Заказ: №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))} — ${esc(order?.project_name || '—')}</span><span>${kind === 'production' ? 'Срок' : 'Монтаж'}: ${kind === 'production' ? dateTimeRu(date) : dateTimeRu(date)}</span>${kind === 'production' ? `<span>Макет: ${esc(job.layout_status || order?.layout_status || '—')}</span><span>Себестоимость: ${money(job.contractor_cost || order?.contractor_cost)}</span>` : `<span>Адрес: ${esc(job.address || order?.data?.install_place || '—')}</span><span>Монтажник: ${esc(job.installer_name || '—')}</span>`}${overdue ? '<span style="color:#991b1b;font-weight:900">Просрочено</span>' : ''}</div>${file ? `<a class="v4-production-link" href="${esc(file)}" target="_blank" rel="noopener">Открыть файл / фото</a>` : ''}<div class="v4-production-card-actions"><button type="button" data-open-order="${esc(job.order_id)}">Открыть заказ</button>${kind === 'production' ? `<button type="button" data-board-production-status="${esc(job.id)}" data-status="В работе">В работу</button><button type="button" class="v4-primary" data-board-production-status="${esc(job.id)}" data-status="Готово">Готово</button>` : `<button type="button" data-board-install-status="${esc(job.id)}" data-status="В работе">В работу</button><button type="button" class="v4-primary" data-board-install-status="${esc(job.id)}" data-status="Выполнен">Выполнен</button>`}</div></article>`;
}
function renderColumns(items, kind, query, statusFilter) {
  const cols = kind === 'production' ? PRODUCTION_COLUMNS : INSTALL_COLUMNS;
  const groups = new Map(cols.map((col) => [col.key, []]));
  items.forEach((job) => {
    const order = lastData.orders.get(job.order_id);
    if (!matchesSearch(job, order, query)) return;
    const status = kind === 'production' ? job.production_status : job.install_status;
    if (statusFilter && status !== statusFilter) return;
    const col = colFor(status, cols);
    groups.get(col.key)?.push({ job, order });
  });
  return `<div class="v4-production-columns">${cols.map((col) => {
    const rows = groups.get(col.key) || [];
    return `<section class="v4-production-column"><h3>${esc(col.title)} <span>${rows.length}</span></h3>${rows.length ? rows.map(({ job, order }) => renderCard(job, kind, order)).join('') : '<div class="v4-production-empty">Нет заданий.</div>'}</section>`;
  }).join('')}</div>`;
}
function renderBoard(kind = 'production') {
  const box = content();
  if (!box) return;
  const query = document.getElementById('productionBoardSearch')?.value?.trim() || '';
  const statusFilter = document.getElementById('productionBoardStatus')?.value || '';
  const productionOpen = lastData.production.filter((job) => !['Готово', 'Выдано', 'Отменено'].includes(job.production_status || '')).length;
  const installationOpen = lastData.installation.filter((job) => !['Выполнен', 'Закрыт', 'Отменён'].includes(job.install_status || '')).length;
  const overdue = [...lastData.production.map((job) => job.deadline), ...lastData.installation.map((job) => job.scheduled_at)].filter(isOverdue).length;
  box.innerHTML = `<div class="v4-production-board"><div class="v4-production-board-head"><div><p class="v4-kicker">Производственная доска</p><h2>Производство и монтаж</h2><p>Очередь заданий по всем заказам: макеты, производство, монтаж, сроки и быстрые статусы.</p></div><div class="v4-production-board-actions"><button type="button" class="v4-primary" data-v4-list-refresh="production">Обновить производство</button></div></div><div class="v4-production-board-summary"><div><span>Производственных</span><b>${lastData.production.length}</b></div><div><span>В работе / не передано</span><b>${productionOpen}</b></div><div><span>Монтажей</span><b>${lastData.installation.length}</b></div><div><span>Монтаж в работе</span><b>${installationOpen}</b></div><div><span>Просрочено</span><b>${overdue}</b></div></div><div class="v4-production-board-filters"><label>Поиск<input id="productionBoardSearch" type="search" value="${esc(query)}" placeholder="Заказ, статус, монтажник, адрес"></label><label>Статус<select id="productionBoardStatus"><option value="">Все статусы</option>${[...new Set([...lastData.production.map((job) => job.production_status), ...lastData.installation.map((job) => job.install_status)].filter(Boolean))].map((status) => `<option ${status === statusFilter ? 'selected' : ''}>${esc(status)}</option>`).join('')}</select></label><div><span class="v4-muted">Тип заданий</span><div class="v4-production-board-tabs"><button type="button" class="${kind === 'production' ? 'is-active' : ''}" data-production-board-kind="production">Производство</button><button type="button" class="${kind === 'installation' ? 'is-active' : ''}" data-production-board-kind="installation">Монтаж</button></div></div></div>${renderColumns(kind === 'production' ? lastData.production : lastData.installation, kind, query, statusFilter)}</div>`;
}
async function loadProductionBoard(force = false) {
  ensureStyles();
  ensureSection();
  ensureMenuButton();
  if (loaded && !force) { renderBoard(document.body.dataset.productionBoardKind || 'production'); return; }
  if (busy) return;
  busy = true;
  const box = content();
  if (box) box.innerHTML = '<div class="v4-empty">Загружаю производственную доску...</div>';
  try {
    await fetchData();
    loaded = true;
    renderBoard(document.body.dataset.productionBoardKind || 'production');
  } catch (error) {
    if (box) box.innerHTML = `<div class="v4-empty is-error">Ошибка загрузки производства: ${esc(friendlyError(error))}</div>`;
  } finally {
    busy = false;
  }
}
async function updateProductionStatus(jobId, status) {
  if (busy) return;
  busy = true;
  try {
    const current = lastData.production.find((job) => job.id === jobId) || (await supabaseClient.from('leader_production_jobs').select('*').eq('id', jobId).single()).data;
    if (!current) throw new Error('Производственное задание не найдено');
    const patch = { production_status: status, updated_at: nowIso() };
    if (status === 'В работе') patch.sent_to_contractor_at = current.sent_to_contractor_at || nowIso();
    if (status === 'Готово') patch.ready_at = nowIso();
    const response = await supabaseClient.from('leader_production_jobs').update(patch).eq('id', jobId).select('*').single();
    if (response.error) throw response.error;
    await Promise.all([
      supabaseClient.from('leader_orders').update({ production_status: status, status: status === 'Готово' ? 'Готово' : 'В производстве', current_stage: `Производство: ${status}`, progress_percent: status === 'Готово' ? 85 : 60, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', current.order_id),
      supabaseClient.from('leader_production_events').insert({ job_id: jobId, order_id: current.order_id, event_type: 'Статус производства', old_status: current.production_status, new_status: status, body: `Изменено с производственной доски: ${status}`, created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null })
    ]);
    toast(`Производство: ${status}`);
    loaded = false;
    await loadProductionBoard(true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка производства: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}
async function updateInstallStatus(jobId, status) {
  if (busy) return;
  busy = true;
  try {
    const current = lastData.installation.find((job) => job.id === jobId) || (await supabaseClient.from('leader_installation_jobs').select('*').eq('id', jobId).single()).data;
    if (!current) throw new Error('Монтажное задание не найдено');
    const patch = { install_status: status, updated_at: nowIso() };
    if (status === 'В работе') patch.started_at = current.started_at || nowIso();
    if (status === 'Выполнен') patch.completed_at = nowIso();
    const response = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', jobId).select('*').single();
    if (response.error) throw response.error;
    await Promise.all([
      supabaseClient.from('leader_orders').update({ installation_status: status, current_stage: `Монтаж: ${status}`, progress_percent: status === 'Выполнен' ? 95 : 75, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', current.order_id),
      supabaseClient.from('leader_installation_events').insert({ job_id: jobId, order_id: current.order_id, event_type: 'Статус монтажа', old_status: current.install_status, new_status: status, body: `Изменено с производственной доски: ${status}`, created_by: v4State.user?.id || null })
    ]);
    toast(`Монтаж: ${status}`);
    loaded = false;
    await loadProductionBoard(true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}
function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  ensureSection();
  ensureMenuButton();
  document.addEventListener('leader-v4:crm-ready', () => { ensureSection(); ensureMenuButton(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="production"]')) setTimeout(() => loadProductionBoard(false), 120);
    const refresh = event.target.closest?.('[data-v4-list-refresh="production"]');
    if (refresh) { event.preventDefault(); loaded = false; loadProductionBoard(true); return; }
    const kind = event.target.closest?.('[data-production-board-kind]');
    if (kind) { event.preventDefault(); document.body.dataset.productionBoardKind = kind.dataset.productionBoardKind; renderBoard(kind.dataset.productionBoardKind); return; }
    const prod = event.target.closest?.('[data-board-production-status]');
    if (prod) { event.preventDefault(); event.stopPropagation(); updateProductionStatus(prod.dataset.boardProductionStatus, prod.dataset.status); return; }
    const install = event.target.closest?.('[data-board-install-status]');
    if (install) { event.preventDefault(); event.stopPropagation(); updateInstallStatus(install.dataset.boardInstallStatus, install.dataset.status); }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'productionBoardSearch') renderBoard(document.body.dataset.productionBoardKind || 'production');
  });
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'productionBoardStatus') renderBoard(document.body.dataset.productionBoardKind || 'production');
  });
}
boot();
