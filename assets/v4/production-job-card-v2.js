import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const JOB_FIELDS = 'id,order_id,title,production_status,layout_status,priority,deadline,sent_to_contractor_at,ready_at,contractor_cost,client_total,file_url,technical_task,contractor_comment,internal_comment,created_at,updated_at';
const ITEM_FIELDS = 'id,job_id,order_id,name,unit,qty,width,height,contractor_price,client_price,comment,created_at';
const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,layout_status,layout_link,production_status,installation_status,installation_address,progress_percent,production_comment,data,created_at';
const EVENT_FIELDS = 'id,event_type,old_status,new_status,body,created_by_email,created_at';
const INSTALL_FIELDS = 'id,title,install_status,address,scheduled_at,installer_name,installer_phone,created_at';

let booted = false;
let busy = false;
let currentBundle = null;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const nowIso = () => new Date().toISOString();
const money = (value) => Number(value || 0) ? `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽` : '—';
const dateTimeRu = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } };

function asData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function datetimeLocal(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  } catch (_) {
    return '';
  }
}

function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('готов') || text.includes('выдан') || text.includes('закры')) return 'is-good';
  if (text.includes('проблем') || text.includes('срыв') || text.includes('передел') || text.includes('отмен')) return 'is-danger';
  if (text.includes('работ') || text.includes('передано') || text.includes('соглас')) return 'is-warn';
  return '';
}

async function safeInsert(table, payload) {
  try {
    await supabaseClient.from(table).insert(payload);
  } catch (error) {
    console.warn(`[leader-v4] Не удалось записать журнал ${table}`, error);
  }
}

function ensureStyles() {
  if (document.getElementById('productionJobCardV2Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionJobCardV2Styles';
  style.textContent = `
    .v4-job-modal{position:fixed;inset:0;z-index:740;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px}.v4-job-card{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bbf7d0;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.36);padding:18px}.v4-job-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-job-head h2{margin:0}.v4-job-head p{margin:6px 0 0;color:#64748b}.v4-job-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.v4-job-grid div{border:1px solid #d1fae5;background:#f0fdf4;border-radius:16px;padding:12px}.v4-job-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#166534}.v4-job-grid b{display:block;margin-top:5px;color:#052e16}.v4-job-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v4-job-section{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;margin-top:12px}.v4-job-section h3{margin:0 0 10px}.v4-job-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:10px;margin:8px 0}.v4-job-row-head{display:flex;justify-content:space-between;gap:10px}.v4-job-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-job-actions button{background:#fff}.v4-job-actions .v4-primary{background:#16a34a;color:#fff;border-color:#16a34a}.v4-job-badge{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-size:12px;font-weight:900;white-space:nowrap}.v4-job-badge.is-warn{background:#fef3c7;color:#92400e}.v4-job-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-job-badge.is-good{background:#dcfce7;color:#166534}.v4-job-empty{border:1px dashed #86efac;border-radius:14px;padding:12px;background:#f0fdf4;color:#166534;font-weight:800}.v4-job-form textarea{min-height:84px;resize:vertical}.v4-job-form .wide{grid-column:1/-1}.v4-job-link{display:inline-flex;font-weight:900;color:#166534;overflow-wrap:anywhere}.v4-job-print-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;padding:10px 12px;font-weight:800;margin:10px 0}
    @media(max-width:820px){.v4-job-card{padding:12px;border-radius:18px}.v4-job-head,.v4-job-columns{display:grid;grid-template-columns:1fr}.v4-job-actions{display:grid}.v4-job-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function host() {
  let element = document.getElementById('productionJobCardV2');
  if (!element) {
    element = document.createElement('div');
    element.id = 'productionJobCardV2';
    document.body.appendChild(element);
  }
  return element;
}

function closeCard() { currentBundle = null; host().innerHTML = ''; busy = false; }
function loading() { host().innerHTML = `<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><h2>Производственное задание</h2><p>Загружаю данные...</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-empty">Загрузка...</div></div></div>`; }
function errorBox(text) { host().innerHTML = `<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><h2>Производственное задание</h2><p>Ошибка загрузки</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-empty">${esc(text)}</div></div></div>`; }

async function fetchBundle(jobId) {
  const jobResponse = await supabaseClient.from('leader_production_jobs').select(JOB_FIELDS).eq('id', jobId).single();
  if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Производственное задание не найдено');
  const job = jobResponse.data;
  const [itemsResponse, orderResponse, eventsResponse, installationResponse] = await Promise.all([
    supabaseClient.from('leader_production_job_items').select(ITEM_FIELDS).eq('job_id', jobId).order('created_at', { ascending: true }).limit(160),
    job.order_id ? supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', job.order_id).single() : Promise.resolve({ data: null, error: null }),
    supabaseClient.from('leader_production_events').select(EVENT_FIELDS).eq('job_id', jobId).order('created_at', { ascending: false }).limit(40),
    supabaseClient.from('leader_installation_jobs').select(INSTALL_FIELDS).eq('production_job_id', jobId).order('created_at', { ascending: false }).limit(20)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  return { job, items: itemsResponse.data || [], order: orderResponse.error ? null : orderResponse.data, events: eventsResponse.error ? [] : eventsResponse.data || [], installation: installationResponse.error ? [] : installationResponse.data || [] };
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-job-empty">Позиции не добавлены.</div>';
  return items.map((item) => `<div class="v4-job-row"><div class="v4-job-row-head"><b>${esc(item.name || 'Позиция')}</b><span>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}</span></div><p>Размер: ${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'} · Себест.: ${money(Number(item.contractor_price || 0) * Number(item.qty || 0))}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>`).join('');
}
function renderEvents(events) {
  if (!events.length) return '<div class="v4-job-empty">Истории пока нет.</div>';
  return events.map((event) => `<div class="v4-job-row"><div class="v4-job-row-head"><b>${esc(event.event_type || 'Событие')}</b><span>${dateTimeRu(event.created_at)}</span></div><p>${event.old_status || event.new_status ? `${esc(event.old_status || '—')} → ${esc(event.new_status || '—')}` : esc(event.body || 'Без комментария')}</p>${event.created_by_email ? `<small>${esc(event.created_by_email)}</small>` : ''}</div>`).join('');
}
function renderInstall(installation) {
  if (!installation.length) return '<div class="v4-job-empty">Монтажные задания не связаны.</div>';
  return installation.map((job) => `<div class="v4-job-row"><div class="v4-job-row-head"><b>${esc(job.title || 'Монтаж')}</b><span class="v4-job-badge ${statusClass(job.install_status)}">${esc(job.install_status || '—')}</span></div><p>${esc(job.address || 'Адрес не указан')} · ${dateTimeRu(job.scheduled_at)}</p><small>${esc(job.installer_name || 'Монтажник не назначен')}</small></div>`).join('');
}
function renderCard(bundle) {
  currentBundle = bundle;
  const { job, order, items, events, installation } = bundle;
  const data = asData(order?.data);
  host().innerHTML = `<div class="v4-job-modal"><div class="v4-job-card"><div class="v4-job-head"><div><p class="v4-kicker">Производственное задание</p><h2>${esc(job.title || order?.project_name || 'Задание')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))} · без данных клиента</p></div><button type="button" data-production-job-close>Закрыть</button></div><div class="v4-job-grid"><div><span>Производство</span><b>${esc(job.production_status || 'Не передано')}</b></div><div><span>Макет</span><b>${esc(job.layout_status || order?.layout_status || '—')}</b></div><div><span>Приоритет</span><b>${esc(job.priority || 'Обычная')}</b></div><div><span>Срок</span><b>${dateTimeRu(job.deadline)}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Себестоимость</span><b>${money(job.contractor_cost)}</b></div></div><div class="v4-job-actions"><button type="button" class="v4-primary" data-print-production-job="${esc(job.id)}">Печать листа</button>${order ? `<button type="button" data-open-order="${esc(order.id)}" data-production-job-close>Открыть заказ</button>` : ''}<button type="button" data-production-job-status="${esc(job.id)}" data-status="Передано в производство">Передано</button><button type="button" data-production-job-status="${esc(job.id)}" data-status="В работе">В работе</button><button type="button" data-production-job-status="${esc(job.id)}" data-status="Готово">Готово</button></div><div class="v4-job-print-note">Печатный лист не содержит имя, телефон и контакты клиента. Только данные производства, заказа, макета и состава работ.</div><div class="v4-job-columns"><section class="v4-job-section"><h3>Редактирование задания</h3><div class="v4-job-form v4-form-grid"><label>Название<input id="jobEditTitle" value="${esc(job.title || '')}"></label><label>Статус<select id="jobEditStatus"><option ${job.production_status === 'Не передано' ? 'selected' : ''}>Не передано</option><option ${job.production_status === 'Передано в производство' ? 'selected' : ''}>Передано в производство</option><option ${job.production_status === 'В работе' ? 'selected' : ''}>В работе</option><option ${job.production_status === 'Готово' ? 'selected' : ''}>Готово</option><option ${job.production_status === 'Проблема' ? 'selected' : ''}>Проблема</option></select></label><label>Макет<select id="jobEditLayout"><option ${job.layout_status === 'Макет не проверен' ? 'selected' : ''}>Макет не проверен</option><option ${job.layout_status === 'На согласовании' ? 'selected' : ''}>На согласовании</option><option ${job.layout_status === 'Макет согласован' ? 'selected' : ''}>Макет согласован</option><option ${job.layout_status === 'Нужны правки' ? 'selected' : ''}>Нужны правки</option></select></label><label>Приоритет<select id="jobEditPriority"><option ${job.priority === 'Обычная' ? 'selected' : ''}>Обычная</option><option ${job.priority === 'Высокая' ? 'selected' : ''}>Высокая</option><option ${job.priority === 'Срочно' ? 'selected' : ''}>Срочно</option></select></label><label>Срок<input id="jobEditDeadline" type="datetime-local" value="${datetimeLocal(job.deadline)}"></label><label>Ссылка на макет / файл<input id="jobEditFile" value="${esc(job.file_url || order?.layout_link || '')}" placeholder="https://..."></label><label class="wide">Техническое задание<textarea id="jobEditTask">${esc(job.technical_task || '')}</textarea></label><label class="wide">Комментарий подрядчику / производству<textarea id="jobEditContractorComment">${esc(job.contractor_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="jobEditInternalComment">${esc(job.internal_comment || '')}</textarea></label></div><div class="v4-job-actions"><button type="button" class="v4-primary" data-save-production-job="${esc(job.id)}">Сохранить задание</button></div></section><section class="v4-job-section"><h3>Данные для производства</h3><div class="v4-job-row"><b>Объект / заказ</b><p>${esc(order?.project_name || '—')}</p></div><div class="v4-job-row"><b>Место размещения / монтаж</b><p>${esc(data.install_place || data.installPlace || order?.installation_address || '—')}</p></div><div class="v4-job-row"><b>Макет / файл</b><p>${job.file_url || order?.layout_link ? `<a class="v4-job-link" href="${esc(job.file_url || order?.layout_link)}" target="_blank" rel="noopener">Открыть файл</a>` : 'Ссылка не указана'}</p></div><div class="v4-job-row"><b>Фото места</b><p>${data.place_photo_link ? `<a class="v4-job-link" href="${esc(data.place_photo_link)}" target="_blank" rel="noopener">Открыть фото места</a>` : 'Ссылка не указана'}</p></div></section></div><section class="v4-job-section"><h3>Состав задания</h3>${renderItems(items)}</section><div class="v4-job-columns"><section class="v4-job-section"><h3>Связанные монтажные задания</h3>${renderInstall(installation)}</section><section class="v4-job-section"><h3>История производства</h3>${renderEvents(events)}</section></div></div></div>`;
}
async function openJobCard(jobId) {
  if (!jobId || busy) return;
  busy = true;
  ensureStyles();
  loading();
  try { renderCard(await fetchBundle(jobId)); }
  catch (error) { errorBox(friendlyError(error)); }
  finally { busy = false; }
}
const value = (id) => document.getElementById(id)?.value?.trim() || '';
async function saveJob(jobId) {
  if (busy) return;
  busy = true;
  try {
    const old = currentBundle?.job || (await fetchBundle(jobId)).job;
    const status = value('jobEditStatus') || old.production_status || 'Не передано';
    const deadlineRaw = value('jobEditDeadline');
    const patch = { title: value('jobEditTitle') || old.title, production_status: status, layout_status: value('jobEditLayout') || old.layout_status, priority: value('jobEditPriority') || old.priority, deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null, file_url: value('jobEditFile') || null, technical_task: value('jobEditTask') || null, contractor_comment: value('jobEditContractorComment') || null, internal_comment: value('jobEditInternalComment') || null, updated_at: nowIso() };
    if (status === 'Передано в производство') patch.sent_to_contractor_at = old.sent_to_contractor_at || nowIso();
    if (status === 'Готово') patch.ready_at = old.ready_at || nowIso();
    const response = await supabaseClient.from('leader_production_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    if (old.order_id) {
      const orderResponse = await supabaseClient.from('leader_orders').update({ production_status: status, layout_status: patch.layout_status, layout_link: patch.file_url, current_stage: `Производство: ${status}`, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', old.order_id);
      if (orderResponse.error) throw orderResponse.error;
    }
    await safeInsert('leader_production_events', { job_id: jobId, order_id: old.order_id, event_type: 'Обновление задания', old_status: old.production_status, new_status: status, body: 'Производственное задание обновлено из карточки задания', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
    toast('Производственное задание сохранено');
    setStatus('Производственное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, production_status: status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
    const updatedBundle = await fetchBundle(jobId);
    renderCard(updatedBundle);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка задания: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}
function printHtml(bundle) {
  const { job, order, items } = bundle;
  const data = asData(order?.data);
  const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.name || '')}</td><td>${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')}</td><td>${item.width || item.height ? `${esc(item.width || '—')}×${esc(item.height || '—')}` : '—'}</td><td>${esc(item.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции не добавлены</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Производственный лист</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:18px 0 8px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:10px;padding:9px}.box span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}.box b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9}.notice{border:2px solid #111827;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}.no-client{background:#ecfdf5;border-color:#86efac;color:#065f46}.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}.line{border-top:1px solid #111827;padding-top:6px}</style></head><body><p class="muted">РА «Лидер» · Производственный лист · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Производственное задание')}</h1><div class="notice no-client">Лист для производства. Не содержит имя, телефон и контакты клиента.</div><div class="grid"><div class="box"><span>Заказ</span><b>№${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</b></div><div class="box"><span>Статус</span><b>${esc(job.production_status || '—')}</b></div><div class="box"><span>Макет</span><b>${esc(job.layout_status || order?.layout_status || '—')}</b></div><div class="box"><span>Срок</span><b>${dateTimeRu(job.deadline)}</b></div><div class="box"><span>Приоритет</span><b>${esc(job.priority || 'Обычная')}</b></div><div class="box"><span>Место размещения</span><b>${esc(data.install_place || data.installPlace || order?.installation_address || '—')}</b></div></div><h2>Файлы</h2><p><b>Макет:</b> ${esc(job.file_url || order?.layout_link || 'не указан')}</p><p><b>Фото места:</b> ${esc(data.place_photo_link || 'не указано')}</p><h2>Техническое задание</h2><div class="box">${esc(job.technical_task || order?.production_comment || 'ТЗ не заполнено')}</div><h2>Состав задания</h2><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><h2>Комментарии</h2><div class="box"><p><b>Производству:</b> ${esc(job.contractor_comment || '—')}</p><p><b>Внутреннее:</b> ${esc(job.internal_comment || '—')}</p></div><div class="sign"><div class="line">Передал</div><div class="line">Принял / выполнил</div></div><script>window.print();<\/script></body></html>`;
}
async function printJob(jobId) {
  try {
    const bundle = currentBundle?.job?.id === jobId ? currentBundle : await fetchBundle(jobId);
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(printHtml(bundle));
    win.document.close();
  } catch (error) { toast(friendlyError(error)); }
}
function enhanceBoardButtons() {
  document.querySelectorAll('[data-board-production-status]').forEach((button) => {
    const actions = button.closest('.v4-production-card-actions');
    const id = button.dataset.boardProductionStatus;
    if (!actions || !id || actions.querySelector(`[data-open-production-job-card="${CSS.escape(id)}"]`)) return;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" data-open-production-job-card="${esc(id)}">Карточка</button><button type="button" data-print-production-job="${esc(id)}">Печать</button>`);
  });
}
function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const open = event.target.closest?.('[data-open-production-job-card]');
    if (open) { event.preventDefault(); event.stopPropagation(); openJobCard(open.dataset.openProductionJobCard); return; }
    const close = event.target.closest?.('[data-production-job-close]');
    if (close) closeCard();
    const save = event.target.closest?.('[data-save-production-job]');
    if (save) { event.preventDefault(); event.stopPropagation(); saveJob(save.dataset.saveProductionJob); return; }
    const print = event.target.closest?.('[data-print-production-job]');
    if (print) { event.preventDefault(); event.stopPropagation(); printJob(print.dataset.printProductionJob); }
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="production"],[data-v4-list-refresh="production"],[data-production-board-kind],[data-board-production-status]')) setTimeout(enhanceBoardButtons, 900);
  });
  new MutationObserver(() => enhanceBoardButtons()).observe(document.body, { childList: true, subtree: true });
  enhanceBoardButtons();
}
boot();
