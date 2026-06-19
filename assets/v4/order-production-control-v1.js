import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,contractor_cost,client_total,layout_status,layout_link,data,production_priority,priority,production_comment,internal_comment,progress_percent,production_status,installation_status,installation_address,ready_at,issued_at';
const ORDER_ITEM_FIELDS = 'id,name,unit,quantity,contractor_price,client_sum,comment,data,created_at';
const PRODUCTION_JOB_FIELDS = 'id,order_id,title,production_status,layout_status,priority,deadline,contractor_cost,client_total,file_url,technical_task,internal_comment,sent_to_contractor_at,ready_at,created_at,updated_at';
const INSTALLATION_JOB_FIELDS = 'id,order_id,title,install_status,installer_name,installer_phone,address,scheduled_at,before_photo_url,after_photo_url,created_at,updated_at';
const PRODUCTION_EVENT_FIELDS = 'id,event_type,old_status,new_status,body,created_by_email,created_at';
const ORDER_HISTORY_FIELDS = 'id,old_status,new_status,comment,changed_by_email,created_at';

let currentOrderId = '';
let busy = false;
let booted = false;
let lastRenderedOrderId = '';

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); } }
function dateTimeRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } }
function nowIso() { return new Date().toISOString(); }
function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('готов') || text.includes('выдан') || text.includes('выполн') || text.includes('соглас')) return 'is-good';
  if (text.includes('проблем') || text.includes('срыв') || text.includes('отмен')) return 'is-danger';
  if (text.includes('работ') || text.includes('производ') || text.includes('соглас') || text.includes('назнач')) return 'is-warn';
  return '';
}
function orderRows(order, orderItems = []) {
  if (orderItems.length) return orderItems.map((item) => ({
    name: item.name,
    unit: item.unit || 'шт',
    qty: item.quantity || item.qty || 1,
    contractor_price: item.contractor_price || 0,
    client_price: item.client_sum && item.quantity ? Number(item.client_sum) / Number(item.quantity || 1) : 0,
    comment: item.comment || '',
    width: item.data?.width || null,
    height: item.data?.height || null
  }));
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((row) => ({
    name: row.name || row.title || 'Позиция',
    unit: row.unit || 'шт',
    qty: row.qty || row.quantity || 1,
    contractor_price: row.price || row.contractor_price || 0,
    client_price: row.client_price || row.clientPrice || row.client_sum || 0,
    comment: row.comment || row.note || '',
    width: row.width || row.w || row.data?.width || null,
    height: row.height || row.h || row.data?.height || null
  }));
}
function ensureStyles() {
  if (document.getElementById('orderProductionControlV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderProductionControlV1Styles';
  style.textContent = `
    .v4-production-panel{border:1px solid #bbf7d0;background:#f0fdf4;border-radius:20px;padding:14px;margin-top:12px;color:#064e3b}
    .v4-production-panel h3{margin:0}.v4-production-panel p{margin:6px 0 0}.v4-production-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.v4-production-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-production-actions button{background:#fff}.v4-production-actions .v4-primary{background:#16a34a;color:#fff;border-color:#16a34a}
    .v4-production-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.v4-production-grid div{border:1px solid #bbf7d0;background:#fff;border-radius:15px;padding:10px}.v4-production-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#166534}.v4-production-grid b{display:block;margin-top:4px;color:#052e16}
    .v4-production-form{display:grid;gap:10px;margin-top:12px}.v4-production-section{border:1px solid #d1fae5;background:#fff;border-radius:16px;padding:12px;margin-top:10px}.v4-production-section h4{margin:0 0 8px}.v4-production-row{border:1px solid #e2e8f0;border-radius:14px;padding:10px;margin:8px 0;background:#f8fafc}.v4-production-row-head{display:flex;justify-content:space-between;gap:10px}.v4-production-badge{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-size:12px;font-weight:900;white-space:nowrap}.v4-production-badge.is-warn{background:#fef3c7;color:#92400e}.v4-production-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-production-badge.is-good{background:#dcfce7;color:#166534}
    .v4-production-timeline{max-height:260px;overflow:auto}.v4-production-empty{border:1px dashed #86efac;border-radius:14px;padding:12px;background:#fff;color:#166534;font-weight:800}.v4-production-link{display:inline-flex;margin-top:6px;font-weight:900;color:#166534;overflow-wrap:anywhere}
    @media(max-width:720px){.v4-production-head{display:grid}.v4-production-actions{display:grid}.v4-production-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}
function panelHost() {
  const card = document.getElementById('orderCardContent');
  if (!card || card.textContent.includes('Выберите заказ')) return null;
  return card.querySelector('.v4-order-detail-panel') || card;
}
async function fetchBundle(orderId) {
  const orderResponse = await supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single();
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const order = orderResponse.data;
  const [itemsResponse, jobsResponse, installsResponse, eventsResponse, historyResponse] = await Promise.all([
    supabaseClient.from('leader_order_items').select(ORDER_ITEM_FIELDS).eq('order_id', orderId).order('created_at', { ascending: true }).limit(120),
    supabaseClient.from('leader_production_jobs').select(PRODUCTION_JOB_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
    supabaseClient.from('leader_installation_jobs').select(INSTALLATION_JOB_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
    supabaseClient.from('leader_production_events').select(PRODUCTION_EVENT_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(30),
    supabaseClient.from('leader_order_status_history').select(ORDER_HISTORY_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(20)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  if (jobsResponse.error) throw jobsResponse.error;
  if (installsResponse.error) throw installsResponse.error;
  return { order, items: itemsResponse.data || [], jobs: jobsResponse.data || [], installs: installsResponse.data || [], events: eventsResponse.error ? [] : eventsResponse.data || [], history: historyResponse.error ? [] : historyResponse.data || [] };
}
function renderJobs(jobs) {
  if (!jobs.length) return '<div class="v4-production-empty">Производственное задание ещё не создано.</div>';
  return jobs.map((job) => `<div class="v4-production-row"><div class="v4-production-row-head"><b>${esc(job.title || 'Производственное задание')}</b><span class="v4-production-badge ${statusClass(job.production_status)}">${esc(job.production_status || 'Не передано')}</span></div><p>Макет: ${esc(job.layout_status || '—')} · Срок: ${dateTimeRu(job.deadline)} · Себест.: ${money(job.contractor_cost)}</p>${job.file_url ? `<a class="v4-production-link" href="${esc(job.file_url)}" target="_blank" rel="noopener">Открыть файл / макет</a>` : ''}${job.technical_task ? `<small>${esc(job.technical_task)}</small>` : ''}<div class="v4-production-actions" style="margin-top:8px"><button type="button" data-production-job-status="${esc(job.id)}" data-status="Передано в производство">Передано</button><button type="button" data-production-job-status="${esc(job.id)}" data-status="В работе">В работе</button><button type="button" data-production-job-status="${esc(job.id)}" data-status="Готово">Готово</button></div></div>`).join('');
}
function renderInstalls(installs) {
  if (!installs.length) return '<div class="v4-production-empty">Монтажное задание не создано.</div>';
  return installs.map((job) => `<div class="v4-production-row"><div class="v4-production-row-head"><b>${esc(job.title || 'Монтаж')}</b><span class="v4-production-badge ${statusClass(job.install_status)}">${esc(job.install_status || 'Нужно назначить')}</span></div><p>${esc(job.address || 'Адрес не указан')} · ${dateTimeRu(job.scheduled_at)} · ${esc(job.installer_name || 'монтажник не назначен')}</p>${job.before_photo_url ? `<a class="v4-production-link" href="${esc(job.before_photo_url)}" target="_blank" rel="noopener">Фото места</a>` : ''}${job.after_photo_url ? `<a class="v4-production-link" href="${esc(job.after_photo_url)}" target="_blank" rel="noopener">Фото результата</a>` : ''}<div class="v4-production-actions" style="margin-top:8px"><button type="button" data-install-job-status="${esc(job.id)}" data-status="Запланирован">Запланирован</button><button type="button" data-install-job-status="${esc(job.id)}" data-status="В работе">В работе</button><button type="button" data-install-job-status="${esc(job.id)}" data-status="Выполнен">Выполнен</button></div></div>`).join('');
}
function renderEvents(bundle) {
  const rows = [
    ...bundle.events.map((event) => ({ type: event.event_type, body: event.body || `${event.old_status || '—'} → ${event.new_status || '—'}`, date: event.created_at, author: event.created_by_email })),
    ...bundle.history.map((event) => ({ type: 'Статус заказа', body: `${event.old_status || '—'} → ${event.new_status || '—'}${event.comment ? ` · ${event.comment}` : ''}`, date: event.created_at, author: event.changed_by_email }))
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 30);
  if (!rows.length) return '<div class="v4-production-empty">Истории производства пока нет.</div>';
  return `<div class="v4-production-timeline">${rows.map((row) => `<div class="v4-production-row"><div class="v4-production-row-head"><b>${esc(row.type || 'Событие')}</b><span>${dateTimeRu(row.date)}</span></div><p>${esc(row.body || '')}</p>${row.author ? `<small>${esc(row.author)}</small>` : ''}</div>`).join('')}</div>`;
}
function renderPanel(bundle) {
  const host = panelHost();
  if (!host) return;
  const old = document.getElementById('orderProductionControlBox');
  if (old) old.remove();
  const { order, jobs, installs } = bundle;
  const data = order.data && typeof order.data === 'object' ? order.data : {};
  host.insertAdjacentHTML('beforeend', `<section id="orderProductionControlBox" class="v4-production-panel"><div class="v4-production-head"><div><h3>Производство и монтаж</h3><p>Контроль макета, файлов, производства, монтажа и выдачи по заказу.</p></div><div class="v4-production-actions"><button type="button" class="v4-primary" data-create-production-job="${esc(order.id)}">${jobs.length ? 'Обновить / создать ещё задание' : 'Создать производственное задание'}</button><button type="button" data-production-refresh="${esc(order.id)}">Обновить</button></div></div><div class="v4-production-grid"><div><span>Статус заказа</span><b>${esc(order.status || 'Новый')}</b></div><div><span>Макет</span><b>${esc(order.layout_status || '—')}</b></div><div><span>Производство</span><b>${esc(order.production_status || 'Не передано')}</b></div><div><span>Монтаж</span><b>${esc(order.installation_status || '—')}</b></div><div><span>Прогресс</span><b>${Number(order.progress_percent || 0)}%</b></div><div><span>Срок</span><b>${dateRu(order.deadline)}</b></div></div><div class="v4-production-section"><h4>Файлы и место размещения</h4><div class="v4-form-grid"><label>Ссылка на макет / облако<input id="prodLayoutLink" value="${esc(order.layout_link || data.layout_link || '')}" placeholder="https://..."></label><label>Фото места / замер<input id="prodPlacePhotoLink" value="${esc(data.place_photo_link || data.placePhotoLink || data.photo_place || '')}" placeholder="https://..."></label><label class="wide">Место размещения / монтаж<input id="prodInstallPlace" value="${esc(data.install_place || data.installPlace || order.installation_address || '')}" placeholder="Адрес, фасад, окно, помещение"></label><label class="wide">Производственный комментарий<textarea id="prodProductionComment" rows="3">${esc(order.production_comment || data.production_comment || '')}</textarea></label></div><div class="v4-production-actions"><button type="button" class="v4-primary" data-save-production-info="${esc(order.id)}">Сохранить файлы и комментарии</button>${order.layout_link || data.layout_link ? `<a class="v4-production-link" href="${esc(order.layout_link || data.layout_link)}" target="_blank" rel="noopener">Открыть макет</a>` : ''}${data.place_photo_link ? `<a class="v4-production-link" href="${esc(data.place_photo_link)}" target="_blank" rel="noopener">Открыть фото места</a>` : ''}</div></div><div class="v4-production-section"><h4>Быстрые этапы заказа</h4><div class="v4-production-actions"><button type="button" data-order-quick-status="${esc(order.id)}" data-status="Макет на согласовании" data-production="Не передано" data-progress="25">Макет на согласовании</button><button type="button" data-order-quick-status="${esc(order.id)}" data-status="В производстве" data-production="В производстве" data-progress="55">В производстве</button><button type="button" data-order-quick-status="${esc(order.id)}" data-status="Готово" data-production="Готово" data-progress="85">Готово</button><button type="button" data-order-quick-status="${esc(order.id)}" data-status="Выдано" data-production="Готово" data-progress="100">Выдано</button></div></div><div class="v4-production-section"><h4>Производственные задания</h4>${renderJobs(jobs)}</div><div class="v4-production-section"><h4>Монтаж</h4>${renderInstalls(installs)}</div><div class="v4-production-section"><h4>История производства и заказа</h4>${renderEvents(bundle)}</div></section>`);
}
async function loadAndRender(orderId, force = false) {
  if (!orderId || busy) return;
  const existing = document.getElementById('orderProductionControlBox');
  if (!force && existing && lastRenderedOrderId === orderId) return;
  currentOrderId = orderId;
  window.LeaderV4CurrentOrderId = orderId;
  try {
    const bundle = await fetchBundle(orderId);
    lastRenderedOrderId = orderId;
    renderPanel(bundle);
  } catch (error) {
    const host = panelHost();
    if (host && !document.getElementById('orderProductionControlBox')) host.insertAdjacentHTML('beforeend', `<section id="orderProductionControlBox" class="v4-production-panel"><div class="v4-production-empty">Ошибка загрузки производства: ${esc(friendlyError(error))}</div></section>`);
  }
}
async function createProductionJob(orderId) {
  if (busy) return;
  busy = true;
  try {
    setStatus('Создаю производственное задание...', 'warn');
    const bundle = await fetchBundle(orderId);
    const order = bundle.order;
    const data = order.data && typeof order.data === 'object' ? order.data : {};
    const rows = orderRows(order, bundle.items);
    const jobResponse = await supabaseClient.from('leader_production_jobs').insert({
      order_id: order.id,
      title: order.project_name || `Заказ №${order.order_number || order.id}`,
      production_status: 'Не передано',
      layout_status: order.layout_status || 'Макет не проверен',
      priority: order.production_priority || order.priority || 'Обычная',
      deadline: order.deadline ? `${order.deadline}T18:00:00` : null,
      contractor_cost: order.contractor_cost || 0,
      client_total: order.client_total || 0,
      file_url: order.layout_link || data.layout_link || null,
      technical_task: order.production_comment || data.production_comment || data.comment || '',
      internal_comment: order.internal_comment || ''
    }).select(PRODUCTION_JOB_FIELDS).single();
    if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Производственное задание не создано');
    const job = jobResponse.data;
    if (rows.length) {
      const items = rows.map((row) => ({ job_id: job.id, order_id: order.id, name: row.name || 'Позиция', unit: row.unit || 'шт', qty: Number(row.qty || 1), width: row.width || null, height: row.height || null, contractor_price: Number(row.contractor_price || 0), client_price: Number(row.client_price || 0), comment: row.comment || '' }));
      const itemsResponse = await supabaseClient.from('leader_production_job_items').insert(items);
      if (itemsResponse.error) throw itemsResponse.error;
    }
    await Promise.all([
      supabaseClient.from('leader_orders').update({ production_status: 'Не передано', current_stage: 'Производственное задание создано', progress_percent: Math.max(Number(order.progress_percent || 0), 35), updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', order.id),
      supabaseClient.from('leader_production_events').insert({ job_id: job.id, order_id: order.id, event_type: 'Создано задание', new_status: 'Не передано', body: 'Производственное задание создано из карточки заказа', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null })
    ]);
    toast('Производственное задание создано');
    setStatus('Производственное задание создано', 'good');
    lastRenderedOrderId = '';
    await loadAndRender(orderId, true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка производства: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
async function saveProductionInfo(orderId) {
  if (busy) return;
  busy = true;
  try {
    const bundle = await fetchBundle(orderId);
    const order = bundle.order;
    const data = order.data && typeof order.data === 'object' ? { ...order.data } : {};
    data.place_photo_link = document.getElementById('prodPlacePhotoLink')?.value?.trim() || '';
    data.install_place = document.getElementById('prodInstallPlace')?.value?.trim() || '';
    data.production_comment = document.getElementById('prodProductionComment')?.value?.trim() || '';
    const layoutLink = document.getElementById('prodLayoutLink')?.value?.trim() || '';
    const response = await supabaseClient.from('leader_orders').update({ layout_link: layoutLink || null, production_comment: data.production_comment || null, installation_address: data.install_place || order.installation_address || null, data, updated_at: nowIso() }).eq('id', orderId);
    if (response.error) throw response.error;
    await supabaseClient.from('leader_order_comments').insert({ order_id: orderId, comment_type: 'production', body: 'Обновлены файлы/место размещения/производственный комментарий', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
    toast('Производственная информация сохранена');
    setStatus('Производственная информация сохранена', 'good');
    lastRenderedOrderId = '';
    await loadAndRender(orderId, true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка сохранения: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
async function quickOrderStatus(orderId, status, productionStatus, progress) {
  if (busy) return;
  busy = true;
  try {
    const bundle = await fetchBundle(orderId);
    const oldStatus = bundle.order.status || null;
    const patch = { status, production_status: productionStatus, progress_percent: Number(progress || 0), current_stage: status, updated_at: nowIso(), stage_updated_at: nowIso() };
    if (status === 'Готово') patch.ready_at = nowIso();
    if (status === 'Выдано') patch.issued_at = nowIso();
    const response = await supabaseClient.from('leader_orders').update(patch).eq('id', orderId);
    if (response.error) throw response.error;
    await supabaseClient.from('leader_order_status_history').insert({ order_id: orderId, old_status: oldStatus, new_status: status, comment: `Быстрое изменение этапа: ${status}`, changed_by: v4State.user?.id || null, changed_by_email: v4State.user?.email || null });
    toast(`Заказ: ${status}`);
    setStatus(`Заказ переведён: ${status}`, 'good');
    lastRenderedOrderId = '';
    await loadAndRender(orderId, true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка статуса: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
async function updateProductionJobStatus(jobId, status) {
  if (busy) return;
  busy = true;
  try {
    const jobResponse = await supabaseClient.from('leader_production_jobs').select('id,order_id,production_status').eq('id', jobId).single();
    if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Задание не найдено');
    const job = jobResponse.data;
    const patch = { production_status: status, updated_at: nowIso() };
    if (status === 'Передано в производство') patch.sent_to_contractor_at = nowIso();
    if (status === 'Готово') patch.ready_at = nowIso();
    const response = await supabaseClient.from('leader_production_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    await Promise.all([
      supabaseClient.from('leader_orders').update({ production_status: status, current_stage: `Производство: ${status}`, progress_percent: status === 'Готово' ? 85 : status === 'В работе' ? 60 : 45, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', job.order_id),
      supabaseClient.from('leader_production_events').insert({ job_id: jobId, order_id: job.order_id, event_type: 'Статус производства', old_status: job.production_status, new_status: status, body: `Производство: ${status}`, created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null })
    ]);
    toast(`Производство: ${status}`);
    lastRenderedOrderId = '';
    await loadAndRender(job.order_id, true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка производства: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
async function updateInstallStatus(jobId, status) {
  if (busy) return;
  busy = true;
  try {
    const jobResponse = await supabaseClient.from('leader_installation_jobs').select('id,order_id,install_status').eq('id', jobId).single();
    if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Монтаж не найден');
    const job = jobResponse.data;
    const patch = { install_status: status, updated_at: nowIso() };
    if (status === 'В работе') patch.started_at = nowIso();
    if (status === 'Выполнен') patch.completed_at = nowIso();
    const response = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    await Promise.all([
      supabaseClient.from('leader_orders').update({ installation_status: status, current_stage: `Монтаж: ${status}`, progress_percent: status === 'Выполнен' ? 95 : 75, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', job.order_id),
      supabaseClient.from('leader_installation_events').insert({ job_id: jobId, order_id: job.order_id, event_type: 'Статус монтажа', old_status: job.install_status, new_status: status, body: `Монтаж: ${status}`, created_by: v4State.user?.id || null })
    ]);
    toast(`Монтаж: ${status}`);
    lastRenderedOrderId = '';
    await loadAndRender(job.order_id, true);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
function scheduleRender(orderId, force = false) {
  currentOrderId = orderId || currentOrderId || window.LeaderV4CurrentOrderId || '';
  if (!currentOrderId) return;
  setTimeout(() => loadAndRender(currentOrderId, force), 180);
  setTimeout(() => loadAndRender(currentOrderId, force), 700);
}
function boot() {
  ensureStyles();
  if (booted) return;
  booted = true;
  document.addEventListener('click', (event) => {
    const openOrder = event.target.closest?.('[data-open-order]');
    if (openOrder?.dataset.openOrder) { currentOrderId = openOrder.dataset.openOrder; window.LeaderV4CurrentOrderId = currentOrderId; scheduleRender(currentOrderId, true); }
    const create = event.target.closest?.('[data-create-production-job]');
    if (create) { event.preventDefault(); event.stopPropagation(); createProductionJob(create.dataset.createProductionJob); return; }
    const refresh = event.target.closest?.('[data-production-refresh]');
    if (refresh) { event.preventDefault(); event.stopPropagation(); lastRenderedOrderId = ''; loadAndRender(refresh.dataset.productionRefresh, true); return; }
    const save = event.target.closest?.('[data-save-production-info]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveProductionInfo(save.dataset.saveProductionInfo); return; }
    const quick = event.target.closest?.('[data-order-quick-status]');
    if (quick) { event.preventDefault(); event.stopPropagation(); quickOrderStatus(quick.dataset.orderQuickStatus, quick.dataset.status, quick.dataset.production, quick.dataset.progress); return; }
    const job = event.target.closest?.('[data-production-job-status]');
    if (job) { event.preventDefault(); event.stopPropagation(); updateProductionJobStatus(job.dataset.productionJobStatus, job.dataset.status); return; }
    const install = event.target.closest?.('[data-install-job-status]');
    if (install) { event.preventDefault(); event.stopPropagation(); updateInstallStatus(install.dataset.installJobStatus, install.dataset.status); }
  }, true);
  document.addEventListener('leader-v4-order-updated', (event) => { const id = event.detail?.order?.id || currentOrderId; if (id) scheduleRender(id, true); });
  document.addEventListener('leader-v4:route-change', () => scheduleRender('', false));
}
boot();
