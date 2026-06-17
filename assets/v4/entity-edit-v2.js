import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,converted_order_id,converted_client_id,next_contact_at,reject_reason,lead_quality,estimated_amount';
const CLIENT_FIELDS = 'id,name,phone,source,address,comment,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,lead_id,client_id,project_name,client_name,client_phone,status,payment_status,deadline,contractor_cost,client_total,profit,prepayment,balance,source,layout_status,layout_link,layout_comment,production_comment,internal_comment,public_comment,production_status,priority,production_priority,current_stage,next_action,progress_percent,installation_status,installation_address,installer_name,installer_phone,data,created_at,updated_at';
const OFFER_FIELDS = 'id,lead_id,calculation_id,client_id,order_id,offer_number,offer_type,title,short_text,full_text,total_sum,valid_until,status,sent_at,approved_at,rejected_at,created_at,updated_at';

let type = '';
let id = '';
let sourceData = null;
let busy = false;
let lastOrderId = null;
let booted = false;

function esc(v) { return String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function val(k) { return byId(k)?.value?.trim() || ''; }
function num(k, fallback = 0) { const raw = val(k).replace(',', '.').replace(/\s+/g, ''); if (raw === '') return fallback; const n = Number(raw); return Number.isFinite(n) ? n : fallback; }
function date(k) { return val(k) || null; }
function now() { return new Date().toISOString(); }

function styles() {
  if (document.getElementById('entityEditV2Styles')) return;
  const s = document.createElement('style');
  s.id = 'entityEditV2Styles';
  s.textContent = `.v4-modal-edit{position:fixed;inset:0;z-index:600;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}.v4-modal-edit-card{width:min(940px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #dbeafe;border-radius:22px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}.v4-modal-edit-head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-modal-edit-head h2{margin:0}.v4-modal-edit-head p{margin:6px 0 0;color:#64748b}.v4-modal-edit-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;padding:10px 12px;margin-bottom:12px;font-weight:800}.v4-modal-edit-form{display:grid;gap:14px}.v4-modal-edit-form .wide{grid-column:1/-1}.v4-modal-edit-form textarea{min-height:86px;resize:vertical}.v4-modal-edit-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:14px}.v4-modal-edit-foot div{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:680px){.v4-modal-edit-card{padding:12px;border-radius:16px}.v4-modal-edit-head,.v4-modal-edit-foot{display:grid}.v4-modal-edit-foot div{display:grid}.v4-modal-edit-foot button{width:100%}}`;
  document.head.appendChild(s);
}
function host() { let h = document.getElementById('entityEditV2'); if (!h) { h = document.createElement('div'); h.id = 'entityEditV2'; document.body.appendChild(h); } return h; }
function close() { type = ''; id = ''; sourceData = null; busy = false; host().innerHTML = ''; }
function shell(title, subtitle, form, note = '') { return `<div class="v4-modal-edit"><div class="v4-modal-edit-card"><div class="v4-modal-edit-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle || '')}</p></div><button type="button" data-edit-close>Закрыть</button></div>${note ? `<div class="v4-modal-edit-note">${esc(note)}</div>` : ''}${form}<div class="v4-modal-edit-foot"><span class="v4-muted">Изменения сохраняются сразу.</span><div><button type="button" data-edit-close>Отмена</button><button form="entityEditV2Form" type="submit" class="v4-primary" ${busy ? 'disabled' : ''}>${busy ? 'Сохраняю...' : 'Сохранить'}</button></div></div></div></div>`; }
function loading(title) { host().innerHTML = shell(title, 'Загружаю данные...', '<div class="v4-empty">Загрузка...</div>'); }
function error(text) { host().innerHTML = shell('Ошибка редактирования', 'Не удалось выполнить действие', `<div class="v4-empty is-error">${esc(text)}</div>`); }

function leadHtml(x) {
  return shell('Редактировать заявку', x.name || x.phone || 'Заявка', `<form id="entityEditV2Form" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edLeadName" value="${esc(x.name || '')}"></label><label>Телефон<input id="edLeadPhone" value="${esc(x.phone || '')}"></label><label>Статус<select id="edLeadStatus">${['Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено','Ждём ответ','Нужно пересчитать','Согласовано','Создан заказ','Отказ','Спам'].map((s) => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Услуга<input id="edLeadService" value="${esc(x.service || '')}"></label><label>Источник<input id="edLeadSource" value="${esc(x.source || '')}"></label><label>Связь<input id="edLeadContact" value="${esc(x.contact_preference || '')}" placeholder="MAX / телефон"></label><label>Город<input id="edLeadCity" value="${esc(x.city || '')}"></label><label>Бюджет<input id="edLeadBudget" type="number" value="${x.budget ?? ''}"></label><label>Оценочная сумма<input id="edLeadEstimated" type="number" value="${x.estimated_amount ?? ''}"></label><label>Качество<select id="edLeadQuality">${['Не оценена','Холодная','Средняя','Тёплая','Горячая'].map((s) => `<option ${x.lead_quality === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="wide">Сообщение клиента<textarea id="edLeadMessage">${esc(x.message || '')}</textarea></label><label class="wide">Страница / ссылка<input id="edLeadPage" value="${esc(x.page_url || '')}"></label></div></form>`);
}
function clientHtml(client, lead) {
  const x = client || lead || {};
  return shell(client?.id ? 'Редактировать клиента' : 'Редактировать данные клиента', x.name || x.phone || 'Клиент', `<form id="entityEditV2Form" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edClientName" value="${esc(x.name || '')}"></label><label>Телефон<input id="edClientPhone" value="${esc(x.phone || '')}"></label><label>Источник<input id="edClientSource" value="${esc(x.source || '')}"></label><label>Адрес / город<input id="edClientAddress" value="${esc(x.address || x.city || '')}"></label><label class="wide">Комментарий<textarea id="edClientComment">${esc(x.comment || x.message || '')}</textarea></label></div></form>`, client?.id ? '' : 'Отдельной карточки клиента нет. Сохраню данные в последнюю связанную заявку.');
}
function orderHtml(x) {
  return shell('Редактировать заказ', `№${x.order_number || String(x.id || '').slice(0, 8)} · ${x.project_name || 'Заказ'}`, `<form id="entityEditV2Form" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название заказа<input id="edOrderProject" value="${esc(x.project_name || '')}"></label><label>Статус<select id="edOrderStatus">${['Новый','В работе','Макет на согласовании','В производстве','Готово','Выдано','Закрыт','Отменён'].map((s) => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Приоритет<select id="edOrderPriority">${['Низкий','Обычный','Высокий','Срочно'].map((s) => `<option ${x.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Срок<input id="edOrderDeadline" type="date" value="${esc(x.deadline || '')}"></label><label>Клиент<input id="edOrderClientName" value="${esc(x.client_name || '')}"></label><label>Телефон клиента<input id="edOrderClientPhone" value="${esc(x.client_phone || '')}"></label><label>Оплата<select id="edOrderPayment">${['Не оплачено','Предоплата','Частично оплачено','Оплачено','Долг','Возврат'].map((s) => `<option ${x.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Клиенту, ₽<input id="edOrderClientTotal" type="number" value="${x.client_total ?? 0}"></label><label>Себестоимость, ₽<input id="edOrderCost" type="number" value="${x.contractor_cost ?? 0}"></label><label>Предоплата, ₽<input id="edOrderPrepay" type="number" value="${x.prepayment ?? 0}"></label><label>Остаток, ₽<input id="edOrderBalance" type="number" value="${x.balance ?? 0}"></label><label>Статус макета<select id="edOrderLayoutStatus">${['Макета нет','Нужно подготовить','В работе','На согласовании','Макет согласован','Готов'].map((s) => `<option ${x.layout_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="wide">Ссылка на макет / облако<input id="edOrderLayoutLink" value="${esc(x.layout_link || '')}" placeholder="https://..."></label><label class="wide">Комментарий к макету<textarea id="edOrderLayoutComment">${esc(x.layout_comment || '')}</textarea></label><label>Статус производства<input id="edOrderProductionStatus" value="${esc(x.production_status || '')}"></label><label>Этап<input id="edOrderStage" value="${esc(x.current_stage || '')}"></label><label>Прогресс, %<input id="edOrderProgress" type="number" min="0" max="100" value="${x.progress_percent ?? 0}"></label><label>Следующее действие<input id="edOrderNextAction" value="${esc(x.next_action || '')}"></label><label class="wide">Производственный комментарий<textarea id="edOrderProductionComment">${esc(x.production_comment || '')}</textarea></label><label class="wide">Публичный комментарий<textarea id="edOrderPublicComment">${esc(x.public_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="edOrderInternalComment">${esc(x.internal_comment || '')}</textarea></label><label>Статус монтажа<input id="edOrderInstallStatus" value="${esc(x.installation_status || '')}"></label><label class="wide">Адрес монтажа<input id="edOrderInstallAddress" value="${esc(x.installation_address || '')}"></label><label>Монтажник<input id="edOrderInstaller" value="${esc(x.installer_name || '')}"></label><label>Телефон монтажника<input id="edOrderInstallerPhone" value="${esc(x.installer_phone || '')}"></label></div></form>`);
}
function offerHtml(x) {
  return shell('Редактировать КП', x.title || `КП №${x.offer_number || ''}`, `<form id="entityEditV2Form" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название<input id="edOfferTitle" value="${esc(x.title || '')}"></label><label>Тип<select id="edOfferType">${['Короткое','Подробное','Для печати','Индивидуальное'].map((s) => `<option ${x.offer_type === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Статус<select id="edOfferStatus">${['Черновик','Отправлено','На согласовании','Согласовано','Отклонено','Устарело'].map((s) => `<option ${x.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Сумма<input id="edOfferTotal" type="number" value="${x.total_sum ?? 0}"></label><label>Действует до<input id="edOfferValid" type="date" value="${esc(x.valid_until || '')}"></label><label class="wide">Короткий текст<textarea id="edOfferShort">${esc(x.short_text || '')}</textarea></label><label class="wide">Полный текст<textarea id="edOfferFull" rows="7">${esc(x.full_text || '')}</textarea></label></div></form>`);
}

async function openEditor(nextType, nextId, options = {}) {
  type = nextType;
  id = nextId;
  sourceData = null;
  styles();
  loading(nextType === 'client' ? 'Клиент' : nextType === 'order' ? 'Заказ' : nextType === 'offer' ? 'КП' : 'Заявка');
  try {
    if (type === 'lead') {
      const r = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', id).single(), 12000, 'Заявка не загрузилась за 12 секунд');
      if (r.error) throw r.error; sourceData = r.data; host().innerHTML = leadHtml(r.data); return;
    }
    if (type === 'client') {
      let lead = null; let client = null;
      if (id) { const lr = await supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', id).single(); if (!lr.error) lead = lr.data; }
      const clientId = options.clientId || lead?.converted_client_id;
      if (clientId) { const cr = await supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', clientId).single(); if (!cr.error) client = cr.data; }
      sourceData = { lead, client }; host().innerHTML = clientHtml(client, lead); return;
    }
    if (type === 'order') {
      const r = await timeout(supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', id).single(), 12000, 'Заказ не загрузился за 12 секунд');
      if (r.error) throw r.error; sourceData = r.data; host().innerHTML = orderHtml(r.data); return;
    }
    if (type === 'offer') {
      const r = await timeout(supabaseClient.from('leader_commercial_offers').select(OFFER_FIELDS).eq('id', id).single(), 12000, 'КП не загрузилось за 12 секунд');
      if (r.error) throw r.error; sourceData = r.data; host().innerHTML = offerHtml(r.data); return;
    }
  } catch (e) { error(friendlyError(e)); }
}

async function saveLead() {
  const patch = { name: val('edLeadName') || null, phone: val('edLeadPhone') || null, status: val('edLeadStatus') || 'Новая', service: val('edLeadService') || null, source: val('edLeadSource') || null, contact_preference: val('edLeadContact') || null, city: val('edLeadCity') || null, budget: num('edLeadBudget', null), estimated_amount: num('edLeadEstimated', 0), lead_quality: val('edLeadQuality') || 'Не оценена', message: val('edLeadMessage') || null, page_url: val('edLeadPage') || null, updated_at: now() };
  const r = await timeout(supabaseClient.from('leader_leads').update(patch).eq('id', id).select(LEAD_FIELDS).single(), 12000, 'Заявка не сохранилась');
  if (r.error) throw r.error;
  setState({ currentLead: v4State.currentLead?.id === id ? { ...v4State.currentLead, ...r.data } : v4State.currentLead, leads: (v4State.leads || []).map((x) => x.id === id ? { ...x, ...r.data } : x) });
  if (r.data.converted_client_id) await supabaseClient.from('leader_clients').update({ name: patch.name, phone: patch.phone, source: patch.source, address: patch.city, updated_at: now() }).eq('id', r.data.converted_client_id);
}
async function saveClient() {
  const patch = { name: val('edClientName') || null, phone: val('edClientPhone') || null, source: val('edClientSource') || null, address: val('edClientAddress') || null, comment: val('edClientComment') || null, updated_at: now() };
  const client = sourceData?.client; const lead = sourceData?.lead;
  if (client?.id) { const r = await timeout(supabaseClient.from('leader_clients').update(patch).eq('id', client.id).select(CLIENT_FIELDS).single(), 12000, 'Клиент не сохранился'); if (r.error) throw r.error; }
  if (lead?.id) { const r = await timeout(supabaseClient.from('leader_leads').update({ name: patch.name, phone: patch.phone, source: patch.source, city: patch.address, updated_at: now() }).eq('id', lead.id).select(LEAD_FIELDS).single(), 12000, 'Заявка клиента не сохранилась'); if (r.error) throw r.error; }
}
async function saveOrder() {
  const clientTotal = num('edOrderClientTotal', 0); const cost = num('edOrderCost', 0); const prepay = num('edOrderPrepay', 0);
  const patch = { project_name: val('edOrderProject') || null, status: val('edOrderStatus') || 'Новый', priority: val('edOrderPriority') || 'Обычный', deadline: date('edOrderDeadline'), client_name: val('edOrderClientName') || null, client_phone: val('edOrderClientPhone') || null, payment_status: val('edOrderPayment') || null, client_total: clientTotal, contractor_cost: cost, profit: clientTotal - cost, prepayment: prepay, balance: num('edOrderBalance', Math.max(clientTotal - prepay, 0)), layout_status: val('edOrderLayoutStatus') || null, layout_link: val('edOrderLayoutLink') || null, layout_comment: val('edOrderLayoutComment') || null, production_status: val('edOrderProductionStatus') || null, current_stage: val('edOrderStage') || null, progress_percent: Math.max(0, Math.min(100, num('edOrderProgress', 0))), next_action: val('edOrderNextAction') || null, production_comment: val('edOrderProductionComment') || null, public_comment: val('edOrderPublicComment') || null, internal_comment: val('edOrderInternalComment') || null, installation_status: val('edOrderInstallStatus') || null, installation_address: val('edOrderInstallAddress') || null, installer_name: val('edOrderInstaller') || null, installer_phone: val('edOrderInstallerPhone') || null, updated_at: now(), stage_updated_at: now() };
  const r = await timeout(supabaseClient.from('leader_orders').update(patch).eq('id', id).select(ORDER_FIELDS).single(), 12000, 'Заказ не сохранился');
  if (r.error) throw r.error; window.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: r.data } }));
}
async function saveOffer() {
  const old = sourceData?.status || null; const status = val('edOfferStatus') || 'Черновик';
  const patch = { title: val('edOfferTitle') || 'Коммерческое предложение', offer_type: val('edOfferType') || 'Короткое', status, total_sum: num('edOfferTotal', 0), valid_until: date('edOfferValid'), short_text: val('edOfferShort') || null, full_text: val('edOfferFull') || null, updated_by: v4State.user?.id || null, updated_at: now() };
  if (old !== status) { if (status === 'Отправлено') patch.sent_at = now(); if (status === 'Согласовано') patch.approved_at = now(); if (status === 'Отклонено') patch.rejected_at = now(); }
  const r = await timeout(supabaseClient.from('leader_commercial_offers').update(patch).eq('id', id).select(OFFER_FIELDS).single(), 12000, 'КП не сохранилось');
  if (r.error) throw r.error;
  if (old !== status) await supabaseClient.from('leader_commercial_offer_events').insert({ offer_id: id, lead_id: r.data.lead_id, calculation_id: r.data.calculation_id, event_type: 'Изменение КП', old_status: old, new_status: status, comment: 'Статус изменён через редактор КП', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
}
function refresh(savedType, savedId) {
  if (savedType === 'lead') document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: savedId } }));
  const map = { client: 'clients', order: 'orders', offer: 'offers' };
  const btn = map[savedType] ? document.querySelector(`[data-v4-list-refresh="${map[savedType]}"]`) : null;
  if (btn) setTimeout(() => btn.click(), 120);
  if (document.body.dataset.v4Tab && window.leaderV4OpenTab) setTimeout(() => window.leaderV4OpenTab(document.body.dataset.v4Tab), 220);
}
async function save(e) {
  e.preventDefault(); if (busy) return; busy = true;
  const savedType = type; const savedId = id;
  try { setStatus('Сохраняю изменения...', 'warn'); if (type === 'lead') await saveLead(); if (type === 'client') await saveClient(); if (type === 'order') await saveOrder(); if (type === 'offer') await saveOffer(); toast('Изменения сохранены'); setStatus('Изменения сохранены', 'good'); close(); refresh(savedType, savedId); } catch (err) { busy = false; toast(friendlyError(err)); setStatus(`Ошибка сохранения: ${friendlyError(err)}`, 'error'); }
}

async function idsForLists() {
  const orders = document.getElementById('ordersListSectionContent');
  if (orders && !orders.dataset.editV2Ready) { const r = await supabaseClient.from('leader_orders').select('id').order('created_at', { ascending: false }).limit(100); const rows = r.data || []; [...orders.querySelectorAll('.v4-crm-list-card')].forEach((card, i) => { const rowId = rows[i]?.id || card.querySelector('[data-open-order]')?.dataset.openOrder; const a = card.querySelector('.v4-crm-actions'); if (rowId && a && !a.querySelector('[data-edit-type="order"]')) a.insertAdjacentHTML('beforeend', `<button type="button" data-edit-type="order" data-edit-id="${esc(rowId)}">Редактировать</button>`); }); orders.dataset.editV2Ready = '1'; }
  const offers = document.getElementById('offersListSectionContent');
  if (offers && !offers.dataset.editV2Ready) { const r = await supabaseClient.from('leader_commercial_offers').select('id').order('created_at', { ascending: false }).limit(100); const rows = r.data || []; [...offers.querySelectorAll('.v4-crm-list-card')].forEach((card, i) => { let a = card.querySelector('.v4-crm-actions'); if (!a) { a = document.createElement('div'); a.className = 'v4-crm-actions'; card.appendChild(a); } if (rows[i]?.id && !a.querySelector('[data-edit-type="offer"]')) a.insertAdjacentHTML('beforeend', `<button type="button" data-edit-type="offer" data-edit-id="${esc(rows[i].id)}">Редактировать КП</button>`); }); offers.dataset.editV2Ready = '1'; }
  const clients = document.getElementById('clientsSectionContent');
  if (clients && !clients.dataset.editV2Ready) { const r = await supabaseClient.from('leader_leads').select('id,converted_client_id').order('created_at', { ascending: false }).limit(300); const rows = r.data || []; [...clients.querySelectorAll('.v4-crm-list-card')].forEach((card) => { const leadId = card.querySelector('[data-open-lead]')?.dataset.openLead; const lr = rows.find((x) => x.id === leadId) || {}; const a = card.querySelector('.v4-crm-actions'); if (leadId && a && !a.querySelector('[data-edit-type="client"]')) a.insertAdjacentHTML('beforeend', `<button type="button" data-edit-type="client" data-edit-id="${esc(leadId)}" data-client-id="${esc(lr.converted_client_id || '')}">Редактировать клиента</button>`); }); clients.dataset.editV2Ready = '1'; }
}
function enhance() {
  if (!v4State.crmReady) return;
  idsForLists().catch(() => {});
  document.querySelectorAll('[data-open-lead]').forEach((b) => { const a = b.closest('.v4-crm-actions,.v4-card-view-actions') || b.closest('.v4-crm-list-card,article')?.querySelector('.v4-crm-actions'); if (a && b.dataset.openLead && !a.querySelector('[data-edit-type="lead"]')) a.insertAdjacentHTML('beforeend', `<button type="button" data-edit-type="lead" data-edit-id="${esc(b.dataset.openLead)}">Редактировать заявку</button>`); });
  const orderActions = document.querySelector('#orderCardSection .v4-order-detail-actions'); if (orderActions && window.LeaderV4CurrentOrderId && !orderActions.querySelector('[data-edit-type="order"]')) orderActions.insertAdjacentHTML('afterbegin', `<button type="button" data-edit-type="order" data-edit-id="${esc(window.LeaderV4CurrentOrderId)}">Редактировать заказ</button>`);
}
function boot() {
  if (booted) return; booted = true; styles();
  document.addEventListener('click', async (e) => { const b = e.target.closest?.('[data-edit-type]'); if (b) { e.preventDefault(); e.stopPropagation(); await openEditor(b.dataset.editType, b.dataset.editId, { clientId: b.dataset.clientId || null }); return; } if (e.target.closest?.('[data-edit-close]')) close(); }, true);
  document.addEventListener('submit', (e) => { if (e.target?.id === 'entityEditV2Form') save(e); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('leader-v4:crm-ready', enhance); document.addEventListener('leader-v4:lead-card-rendered', enhance); document.addEventListener('leader-v4:route-change', () => setTimeout(enhance, 300));
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-v4-list-refresh],[data-v4-tab-button]')) setTimeout(() => { document.querySelectorAll('#ordersListSectionContent,#offersListSectionContent,#clientsSectionContent').forEach((el) => delete el.dataset.editV2Ready); enhance(); }, 800); });
  setInterval(enhance, 2200); enhance();
}
boot();
