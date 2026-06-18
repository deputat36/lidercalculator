import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

let booted = false;
let busy = false;
let bundle = null;

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const nowIso = () => new Date().toISOString();
const dt = (v) => { if (!v) return '—'; try { return new Date(v).toLocaleString('ru-RU'); } catch (_) { return String(v); } };
const localDt = (v) => { if (!v) return ''; try { const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); } catch (_) { return ''; } };
const money = (v) => Number(v || 0) ? `${Math.round(Number(v || 0)).toLocaleString('ru-RU')} ₽` : '—';

function asData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

async function safeInsert(table, payload) {
  try {
    await supabaseClient.from(table).insert(payload);
  } catch (error) {
    console.warn(`[leader-v4] Не удалось записать журнал ${table}`, error);
  }
}

function ensureStyles() {
  if (document.getElementById('installationJobCardV2Styles')) return;
  const s = document.createElement('style');
  s.id = 'installationJobCardV2Styles';
  s.textContent = `
    .v4-install-modal{position:fixed;inset:0;z-index:750;background:rgba(15,23,42,.62);display:grid;place-items:center;padding:16px}.v4-install-card{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #bfdbfe;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.36);padding:18px}.v4-install-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-install-head h2{margin:0}.v4-install-head p{margin:6px 0 0;color:#64748b}.v4-install-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}.v4-install-grid div{border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;padding:12px}.v4-install-grid span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#1d4ed8}.v4-install-grid b{display:block;margin-top:5px;color:#0f172a}.v4-install-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}.v4-install-section{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;margin-top:12px}.v4-install-section h3{margin:0 0 10px}.v4-install-row{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:10px;margin:8px 0}.v4-install-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-install-actions button{background:#fff}.v4-install-actions .v4-primary{background:#2563eb;color:#fff;border-color:#2563eb}.v4-install-empty{border:1px dashed #93c5fd;border-radius:14px;padding:12px;background:#eff6ff;color:#1d4ed8;font-weight:800}.v4-install-form textarea{min-height:84px;resize:vertical}.v4-install-form .wide{grid-column:1/-1}.v4-install-link{font-weight:900;color:#1d4ed8;overflow-wrap:anywhere}.v4-install-note{border:1px solid #bbf7d0;background:#f0fdf4;color:#166534;border-radius:14px;padding:10px 12px;font-weight:800;margin:10px 0}@media(max-width:820px){.v4-install-card{padding:12px;border-radius:18px}.v4-install-head,.v4-install-columns{display:grid;grid-template-columns:1fr}.v4-install-actions{display:grid}.v4-install-actions button{width:100%}}
  `;
  document.head.appendChild(s);
}

function host() {
  let el = document.getElementById('installationJobCardV2');
  if (!el) { el = document.createElement('div'); el.id = 'installationJobCardV2'; document.body.appendChild(el); }
  return el;
}

function closeCard() { bundle = null; host().innerHTML = ''; busy = false; }
function loading() { host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Загрузка...</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">Загружаю карточку монтажа...</div></div></div>`; }
function errorBox(text) { host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><h2>Монтажное задание</h2><p>Ошибка</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-empty">${esc(text)}</div></div></div>`; }

async function fetchBundle(jobId) {
  const jobRes = await supabaseClient.from('leader_installation_jobs').select('*').eq('id', jobId).single();
  if (jobRes.error || !jobRes.data) throw jobRes.error || new Error('Монтажное задание не найдено');
  const job = jobRes.data;
  const [itemsRes, orderRes, prodRes, eventsRes, commentsRes] = await Promise.all([
    supabaseClient.from('leader_installation_job_items').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
    job.order_id ? supabaseClient.from('leader_orders').select('id,order_number,project_name,status,layout_link,installation_address,data').eq('id', job.order_id).single() : Promise.resolve({ data: null }),
    job.production_job_id ? supabaseClient.from('leader_production_jobs').select('id,title,production_status,file_url').eq('id', job.production_job_id).single() : Promise.resolve({ data: null }),
    supabaseClient.from('leader_installation_events').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(40),
    supabaseClient.from('leader_installation_comments').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(30)
  ]);
  if (itemsRes.error) throw itemsRes.error;
  return { job, items: itemsRes.data || [], order: orderRes.error ? null : orderRes.data, production: prodRes.error ? null : prodRes.data, events: eventsRes.error ? [] : eventsRes.data || [], comments: commentsRes.error ? [] : commentsRes.data || [] };
}

function itemRows(items) {
  if (!items.length) return '<div class="v4-install-empty">Позиции монтажа не добавлены.</div>';
  return items.map((it) => `<div class="v4-install-row"><b>${esc(it.name || 'Позиция')}</b><p>${Number(it.qty || 0).toLocaleString('ru-RU')} ${esc(it.unit || 'шт')} · ${it.width || it.height ? `${esc(it.width || '—')}×${esc(it.height || '—')}` : 'размер не указан'} · ${money(Number(it.installer_price || 0) * Number(it.qty || 0))}</p>${it.comment ? `<small>${esc(it.comment)}</small>` : ''}</div>`).join('');
}

function historyRows(rows, empty) {
  if (!rows.length) return `<div class="v4-install-empty">${empty}</div>`;
  return rows.map((r) => `<div class="v4-install-row"><b>${esc(r.event_type || r.comment_type || 'Событие')}</b><p>${esc(r.body || `${r.old_status || '—'} → ${r.new_status || '—'}`)}</p><small>${dt(r.created_at)}</small></div>`).join('');
}

function render(b) {
  bundle = b;
  const { job, order, production, items, events, comments } = b;
  const data = asData(order?.data);
  host().innerHTML = `<div class="v4-install-modal"><div class="v4-install-card"><div class="v4-install-head"><div><p class="v4-kicker">Монтажное задание</p><h2>${esc(job.title || order?.project_name || 'Монтаж')}</h2><p>Заказ №${esc(order?.order_number || String(job.order_id || '').slice(0, 8))} · без данных клиента</p></div><button type="button" data-installation-job-close>Закрыть</button></div><div class="v4-install-grid"><div><span>Статус</span><b>${esc(job.install_status || 'Нужно назначить')}</b></div><div><span>Дата</span><b>${dt(job.scheduled_at)}</b></div><div><span>Монтажник</span><b>${esc(job.installer_name || 'Не назначен')}</b></div><div><span>Адрес</span><b>${esc(job.address || order?.installation_address || data.install_place || '—')}</b></div><div><span>Позиции</span><b>${items.length}</b></div><div><span>Оплата</span><b>${money(job.installer_cost)}</b></div></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-print-installation-job="${esc(job.id)}">Печать листа</button>${order ? `<button type="button" data-open-order="${esc(order.id)}" data-installation-job-close>Открыть заказ</button>` : ''}<button type="button" data-installation-job-status="${esc(job.id)}" data-status="Запланирован">Запланирован</button><button type="button" data-installation-job-status="${esc(job.id)}" data-status="В работе">В работе</button><button type="button" data-installation-job-status="${esc(job.id)}" data-status="Выполнен">Выполнен</button></div><div class="v4-install-note">Печатный лист монтажа не содержит имя, телефон и контакты клиента. Только адрес, место, ТЗ, фото и состав работ.</div><div class="v4-install-columns"><section class="v4-install-section"><h3>Редактирование монтажа</h3><div class="v4-install-form v4-form-grid"><label>Название<input id="installTitle" value="${esc(job.title || '')}"></label><label>Статус<select id="installStatus"><option ${job.install_status === 'Нужно назначить' ? 'selected' : ''}>Нужно назначить</option><option ${job.install_status === 'Запланирован' ? 'selected' : ''}>Запланирован</option><option ${job.install_status === 'В работе' ? 'selected' : ''}>В работе</option><option ${job.install_status === 'Выполнен' ? 'selected' : ''}>Выполнен</option><option ${job.install_status === 'Проблема' ? 'selected' : ''}>Проблема</option></select></label><label>Дата и время<input id="installScheduled" type="datetime-local" value="${localDt(job.scheduled_at)}"></label><label>Монтажник<input id="installInstaller" value="${esc(job.installer_name || '')}"></label><label>Телефон монтажника<input id="installInstallerPhone" value="${esc(job.installer_phone || '')}"></label><label class="wide">Адрес / место<input id="installAddress" value="${esc(job.address || order?.installation_address || data.install_place || '')}"></label><label>Фото места<input id="installBefore" value="${esc(job.before_photo_url || data.place_photo_link || '')}" placeholder="https://..."></label><label>Фото результата<input id="installAfter" value="${esc(job.after_photo_url || '')}" placeholder="https://..."></label><label class="wide">ТЗ<textarea id="installTask">${esc(job.technical_task || '')}</textarea></label><label class="wide">Инструмент<textarea id="installTools">${esc(job.tools_required || '')}</textarea></label><label class="wide">Комментарий монтажнику<textarea id="installComment">${esc(job.installer_comment || '')}</textarea></label></div><div class="v4-install-actions"><button type="button" class="v4-primary" data-save-installation-job="${esc(job.id)}">Сохранить монтаж</button></div></section><section class="v4-install-section"><h3>Данные для монтажа</h3><div class="v4-install-row"><b>Производство</b><p>${production ? `${esc(production.title || 'Производство')} · ${esc(production.production_status || '—')}` : 'Не связано'}</p></div><div class="v4-install-row"><b>Макет</b><p>${production?.file_url || order?.layout_link ? `<a class="v4-install-link" href="${esc(production?.file_url || order?.layout_link)}" target="_blank" rel="noopener">Открыть файл</a>` : 'Ссылка не указана'}</p></div><div class="v4-install-row"><b>Фото места</b><p>${job.before_photo_url || data.place_photo_link ? `<a class="v4-install-link" href="${esc(job.before_photo_url || data.place_photo_link)}" target="_blank" rel="noopener">Открыть фото места</a>` : 'Ссылка не указана'}</p></div><div class="v4-install-row"><b>Фото результата</b><p>${job.after_photo_url ? `<a class="v4-install-link" href="${esc(job.after_photo_url)}" target="_blank" rel="noopener">Открыть фото результата</a>` : 'Ссылка не указана'}</p></div></section></div><section class="v4-install-section"><h3>Состав монтажа</h3>${itemRows(items)}</section><div class="v4-install-columns"><section class="v4-install-section"><h3>Комментарии</h3>${historyRows(comments, 'Комментариев пока нет.')}<div class="v4-install-form" style="margin-top:10px"><textarea id="installNewComment" placeholder="Добавить комментарий"></textarea><button type="button" data-add-installation-comment="${esc(job.id)}">Добавить комментарий</button></div></section><section class="v4-install-section"><h3>История монтажа</h3>${historyRows(events, 'Истории пока нет.')}</section></div></div></div>`;
}

async function openCard(id) { if (!id || busy) return; busy = true; loading(); try { render(await fetchBundle(id)); } catch (e) { errorBox(friendlyError(e)); } finally { busy = false; } }
const val = (id) => document.getElementById(id)?.value?.trim() || '';

async function saveJob(id) {
  if (busy) return; busy = true;
  try {
    const old = bundle?.job || (await fetchBundle(id)).job;
    const status = val('installStatus') || old.install_status || 'Нужно назначить';
    const scheduled = val('installScheduled');
    const patch = { title: val('installTitle') || old.title, install_status: status, installer_name: val('installInstaller') || null, installer_phone: val('installInstallerPhone') || null, address: val('installAddress') || null, scheduled_at: scheduled ? new Date(scheduled).toISOString() : null, before_photo_url: val('installBefore') || null, after_photo_url: val('installAfter') || null, technical_task: val('installTask') || null, tools_required: val('installTools') || null, installer_comment: val('installComment') || null, updated_by: v4State.user?.id || null, updated_at: nowIso() };
    if (status === 'В работе') patch.started_at = old.started_at || nowIso();
    if (status === 'Выполнен') patch.completed_at = old.completed_at || nowIso();
    const res = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', id).select('*').single();
    if (res.error) throw res.error;
    if (old.order_id) {
      const orderRes = await supabaseClient.from('leader_orders').update({ installation_status: status, installation_address: patch.address, installation_scheduled_at: patch.scheduled_at, installer_name: patch.installer_name, installer_phone: patch.installer_phone, current_stage: `Монтаж: ${status}`, updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', old.order_id);
      if (orderRes.error) throw orderRes.error;
    }
    await safeInsert('leader_installation_events', { job_id: id, order_id: old.order_id, event_type: 'Обновление монтажа', old_status: old.install_status, new_status: status, body: 'Монтажное задание обновлено из карточки монтажа', created_by: v4State.user?.id || null });
    toast('Монтаж сохранён');
    setStatus('Монтажное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, installation_status: status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
    await openCard(id);
  } catch (e) { toast(friendlyError(e)); setStatus(`Ошибка монтажа: ${friendlyError(e)}`, 'error'); } finally { busy = false; }
}

async function addComment(id) {
  const body = val('installNewComment');
  if (!body || busy) return; busy = true;
  try {
    const r = await supabaseClient.from('leader_installation_comments').insert({ job_id: id, comment_type: 'internal', body, created_by: v4State.user?.id || null });
    if (r.error) throw r.error;
    toast('Комментарий добавлен');
    await openCard(id);
  } catch (e) { toast(friendlyError(e)); } finally { busy = false; }
}

function printHtml(b) {
  const { job, order, production, items } = b;
  const data = asData(order?.data);
  const rows = items.length ? items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.name || '')}</td><td>${Number(it.qty || 0).toLocaleString('ru-RU')} ${esc(it.unit || '')}</td><td>${it.width || it.height ? `${esc(it.width || '—')}×${esc(it.height || '—')}` : '—'}</td><td>${esc(it.comment || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции монтажа не добавлены</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Монтажный лист</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:18px 0 8px}.muted{color:#64748b}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:10px;padding:9px}.box span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}.box b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9}.notice{border:2px solid #86efac;background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}.line{border-top:1px solid #111827;padding-top:6px}</style></head><body><p class="muted">РА «Лидер» · Монтажный лист · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(job.title || order?.project_name || 'Монтажное задание')}</h1><div class="notice">Лист для монтажа. Не содержит имя, телефон и контакты клиента.</div><div class="grid"><div class="box"><span>Заказ</span><b>№${esc(order?.order_number || String(job.order_id || '').slice(0, 8))}</b></div><div class="box"><span>Статус</span><b>${esc(job.install_status || '—')}</b></div><div class="box"><span>Дата и время</span><b>${dt(job.scheduled_at)}</b></div><div class="box"><span>Монтажник</span><b>${esc(job.installer_name || 'не назначен')}</b></div><div class="box"><span>Адрес / место</span><b>${esc(job.address || order?.installation_address || data.install_place || '—')}</b></div><div class="box"><span>Производство</span><b>${esc(production?.title || '—')}</b></div></div><h2>Файлы и фото</h2><p><b>Макет:</b> ${esc(production?.file_url || order?.layout_link || 'не указан')}</p><p><b>Фото места:</b> ${esc(job.before_photo_url || data.place_photo_link || 'не указано')}</p><p><b>Фото результата:</b> ${esc(job.after_photo_url || 'не указано')}</p><h2>Техническое задание</h2><div class="box">${esc(job.technical_task || 'ТЗ не заполнено')}</div><h2>Инструмент</h2><div class="box">${esc(job.tools_required || 'Не указан')}</div><h2>Состав монтажа</h2><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><h2>Комментарии</h2><div class="box"><p><b>Монтажнику:</b> ${esc(job.installer_comment || '—')}</p></div><div class="sign"><div class="line">Передал</div><div class="line">Монтаж выполнен / принял</div></div><script>window.print();<\/script></body></html>`;
}

async function printJob(id) {
  try {
    const b = bundle?.job?.id === id ? bundle : await fetchBundle(id);
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('Браузер заблокировал окно печати');
    w.document.open();
    w.document.write(printHtml(b));
    w.document.close();
  } catch (e) { toast(friendlyError(e)); }
}

function enhance() {
  document.querySelectorAll('[data-board-install-status]').forEach((btn) => {
    const actions = btn.closest('.v4-production-card-actions');
    const id = btn.dataset.boardInstallStatus;
    if (!actions || !id || actions.querySelector(`[data-open-installation-job-card="${CSS.escape(id)}"]`)) return;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" data-open-installation-job-card="${esc(id)}">Карточка</button><button type="button" data-print-installation-job="${esc(id)}">Печать</button>`);
  });
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (e) => {
    const open = e.target.closest?.('[data-open-installation-job-card]');
    if (open) { e.preventDefault(); e.stopPropagation(); openCard(open.dataset.openInstallationJobCard); return; }
    if (e.target.closest?.('[data-installation-job-close]')) closeCard();
    const save = e.target.closest?.('[data-save-installation-job]');
    if (save) { e.preventDefault(); e.stopPropagation(); saveJob(save.dataset.saveInstallationJob); return; }
    const comment = e.target.closest?.('[data-add-installation-comment]');
    if (comment) { e.preventDefault(); e.stopPropagation(); addComment(comment.dataset.addInstallationComment); return; }
    const print = e.target.closest?.('[data-print-installation-job]');
    if (print) { e.preventDefault(); e.stopPropagation(); printJob(print.dataset.printInstallationJob); }
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCard(); });
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-v4-tab-button="production"],[data-v4-list-refresh="production"],[data-production-board-kind],[data-board-install-status]')) setTimeout(enhance, 900); });
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
  enhance();
}

boot();
