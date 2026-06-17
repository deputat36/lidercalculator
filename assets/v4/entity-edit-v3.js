import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,converted_order_id,converted_client_id,next_contact_at,reject_reason,lead_quality,estimated_amount';
const CLIENT_FIELDS = 'id,name,phone,source,address,comment,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,lead_id,client_id,project_name,client_name,client_phone,status,payment_status,deadline,contractor_cost,client_total,profit,prepayment,balance,source,layout_status,layout_link,layout_comment,production_comment,internal_comment,public_comment,production_status,priority,current_stage,next_action,progress_percent,installation_status,installation_address,installer_name,installer_phone,data,created_at,updated_at';
const OFFER_FIELDS = 'id,lead_id,calculation_id,client_id,order_id,offer_number,offer_type,title,short_text,full_text,total_sum,valid_until,status,sent_at,approved_at,rejected_at,created_at,updated_at';

let editType = '';
let editId = '';
let editData = null;
let busy = false;
let booted = false;
let lastEnhanceAt = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function val(id) { return byId(id)?.value?.trim() || ''; }
function num(id, fallback = 0) {
  const raw = val(id).replace(',', '.').replace(/\s+/g, '');
  if (raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
function date(id) { return val(id) || null; }
function now() { return new Date().toISOString(); }

function ensureStyles() {
  if (document.getElementById('entityEditV3Styles')) return;
  const style = document.createElement('style');
  style.id = 'entityEditV3Styles';
  style.textContent = `.v4-modal-edit{position:fixed;inset:0;z-index:700;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}.v4-modal-edit-card{width:min(940px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #dbeafe;border-radius:22px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}.v4-modal-edit-head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-modal-edit-head h2{margin:0}.v4-modal-edit-head p{margin:6px 0 0;color:#64748b}.v4-modal-edit-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;padding:10px 12px;margin-bottom:12px;font-weight:800}.v4-modal-edit-form{display:grid;gap:14px}.v4-modal-edit-form .wide{grid-column:1/-1}.v4-modal-edit-form textarea{min-height:86px;resize:vertical}.v4-modal-edit-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:14px}.v4-modal-edit-foot div{display:flex;gap:8px;flex-wrap:wrap}.v4-edit-helper-button{background:#f8fafc}@media(max-width:680px){.v4-modal-edit-card{padding:12px;border-radius:16px}.v4-modal-edit-head,.v4-modal-edit-foot{display:grid}.v4-modal-edit-foot div{display:grid}.v4-modal-edit-foot button{width:100%}}`;
  document.head.appendChild(style);
}
function modalHost() {
  let host = document.getElementById('entityEditV3');
  if (!host) {
    host = document.createElement('div');
    host.id = 'entityEditV3';
    document.body.appendChild(host);
  }
  return host;
}
function closeModal() {
  editType = '';
  editId = '';
  editData = null;
  busy = false;
  modalHost().innerHTML = '';
}
function shell(title, subtitle, body, note = '') {
  return `<div class="v4-modal-edit" role="dialog" aria-modal="true"><div class="v4-modal-edit-card"><div class="v4-modal-edit-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle || '')}</p></div><button type="button" data-edit-close>Закрыть</button></div>${note ? `<div class="v4-modal-edit-note">${esc(note)}</div>` : ''}${body}<div class="v4-modal-edit-foot"><span class="v4-muted">Изменения сохраняются сразу.</span><div><button type="button" data-edit-close>Отмена</button><button form="entityEditFormV3" type="submit" class="v4-primary" ${busy ? 'disabled' : ''}>${busy ? 'Сохраняю...' : 'Сохранить'}</button></div></div></div></div>`;
}
function loading(title) { modalHost().innerHTML = shell(title, 'Загружаю данные...', '<div class="v4-empty">Загрузка...</div>'); }
function errorBox(text) { modalHost().innerHTML = shell('Ошибка редактирования', 'Не удалось выполнить действие', `<div class="v4-empty is-error">${esc(text)}</div>`); }
function options(list, selected) { return list.map((item) => `<option ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join(''); }

function leadForm(lead) {
  return shell('Редактировать заявку', lead.name || lead.phone || 'Заявка', `<form id="entityEditFormV3" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edLeadName" value="${esc(lead.name || '')}"></label><label>Телефон<input id="edLeadPhone" value="${esc(lead.phone || '')}"></label><label>Статус<select id="edLeadStatus">${options(['Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено','Ждём ответ','Нужно пересчитать','Согласовано','Создан заказ','Отказ','Спам'], lead.status)}</select></label><label>Услуга<input id="edLeadService" value="${esc(lead.service || '')}"></label><label>Источник<input id="edLeadSource" value="${esc(lead.source || '')}"></label><label>Связь<input id="edLeadContact" value="${esc(lead.contact_preference || '')}" placeholder="MAX / телефон"></label><label>Город<input id="edLeadCity" value="${esc(lead.city || '')}"></label><label>Бюджет<input id="edLeadBudget" type="number" value="${lead.budget ?? ''}"></label><label>Оценочная сумма<input id="edLeadEstimated" type="number" value="${lead.estimated_amount ?? ''}"></label><label>Качество<select id="edLeadQuality">${options(['Не оценена','Холодная','Средняя','Тёплая','Горячая'], lead.lead_quality)}</select></label><label class="wide">Сообщение клиента<textarea id="edLeadMessage">${esc(lead.message || '')}</textarea></label><label class="wide">Страница / ссылка<input id="edLeadPage" value="${esc(lead.page_url || '')}"></label></div></form>`);
}
function clientForm(client, lead) {
  const data = client || lead || {};
  return shell(client?.id ? 'Редактировать клиента' : 'Редактировать данные клиента', data.name || data.phone || 'Клиент', `<form id="entityEditFormV3" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edClientName" value="${esc(data.name || '')}"></label><label>Телефон<input id="edClientPhone" value="${esc(data.phone || '')}"></label><label>Источник<input id="edClientSource" value="${esc(data.source || '')}"></label><label>Адрес / город<input id="edClientAddress" value="${esc(data.address || data.city || '')}"></label><label class="wide">Комментарий<textarea id="edClientComment">${esc(data.comment || data.message || '')}</textarea></label></div></form>`, client?.id ? '' : 'Отдельной карточки клиента нет. Сохраню данные в связанную заявку.');
}
function orderForm(order) {
  return shell('Редактировать заказ', `№${order.order_number || String(order.id || '').slice(0, 8)} · ${order.project_name || 'Заказ'}`, `<form id="entityEditFormV3" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название заказа<input id="edOrderProject" value="${esc(order.project_name || '')}"></label><label>Статус<select id="edOrderStatus">${options(['Новый','В работе','Макет на согласовании','В производстве','Готово','Выдано','Закрыт','Отменён'], order.status)}</select></label><label>Приоритет<select id="edOrderPriority">${options(['Низкий','Обычный','Высокий','Срочно'], order.priority)}</select></label><label>Срок<input id="edOrderDeadline" type="date" value="${esc(order.deadline || '')}"></label><label>Клиент<input id="edOrderClientName" value="${esc(order.client_name || '')}"></label><label>Телефон клиента<input id="edOrderClientPhone" value="${esc(order.client_phone || '')}"></label><label>Оплата<select id="edOrderPayment">${options(['Не оплачено','Предоплата','Частично оплачено','Оплачено','Долг','Возврат'], order.payment_status)}</select></label><label>Клиенту, ₽<input id="edOrderClientTotal" type="number" value="${order.client_total ?? 0}"></label><label>Себестоимость, ₽<input id="edOrderCost" type="number" value="${order.contractor_cost ?? 0}"></label><label>Предоплата, ₽<input id="edOrderPrepay" type="number" value="${order.prepayment ?? 0}"></label><label>Остаток, ₽<input id="edOrderBalance" type="number" value="${order.balance ?? 0}"></label><label>Статус макета<select id="edOrderLayoutStatus">${options(['Макета нет','Нужно подготовить','В работе','На согласовании','Макет согласован','Готов'], order.layout_status)}</select></label><label class="wide">Ссылка на макет / облако<input id="edOrderLayoutLink" value="${esc(order.layout_link || '')}" placeholder="https://..."></label><label class="wide">Комментарий к макету<textarea id="edOrderLayoutComment">${esc(order.layout_comment || '')}</textarea></label><label>Статус производства<input id="edOrderProductionStatus" value="${esc(order.production_status || '')}"></label><label>Этап<input id="edOrderStage" value="${esc(order.current_stage || '')}"></label><label>Прогресс, %<input id="edOrderProgress" type="number" min="0" max="100" value="${order.progress_percent ?? 0}"></label><label>Следующее действие<input id="edOrderNextAction" value="${esc(order.next_action || '')}"></label><label class="wide">Производственный комментарий<textarea id="edOrderProductionComment">${esc(order.production_comment || '')}</textarea></label><label class="wide">Публичный комментарий<textarea id="edOrderPublicComment">${esc(order.public_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="edOrderInternalComment">${esc(order.internal_comment || '')}</textarea></label><label>Статус монтажа<input id="edOrderInstallStatus" value="${esc(order.installation_status || '')}"></label><label class="wide">Адрес монтажа<input id="edOrderInstallAddress" value="${esc(order.installation_address || '')}"></label><label>Монтажник<input id="edOrderInstaller" value="${esc(order.installer_name || '')}"></label><label>Телефон монтажника<input id="edOrderInstallerPhone" value="${esc(order.installer_phone || '')}"></label></div></form>`);
}
function offerForm(offer) {
  return shell('Редактировать КП', offer.title || `КП №${offer.offer_number || ''}`, `<form id="entityEditFormV3" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название<input id="edOfferTitle" value="${esc(offer.title || '')}"></label><label>Тип<select id="edOfferType">${options(['Короткое','Подробное','Для печати','Индивидуальное'], offer.offer_type)}</select></label><label>Статус<select id="edOfferStatus">${options(['Черновик','Отправлено','На согласовании','Согласовано','Отклонено','Устарело'], offer.status)}</select></label><label>Сумма<input id="edOfferTotal" type="number" value="${offer.total_sum ?? 0}"></label><label>Действует до<input id="edOfferValid" type="date" value="${esc(offer.valid_until || '')}"></label><label class="wide">Короткий текст<textarea id="edOfferShort">${esc(offer.short_text || '')}</textarea></label><label class="wide">Полный текст<textarea id="edOfferFull" rows="7">${esc(offer.full_text || '')}</textarea></label></div></form>`);
}

async function openEditor(nextType, nextId, meta = {}) {
  editType = nextType;
  editId = nextId;
  editData = null;
  ensureStyles();
  loading(nextType === 'client' ? 'Клиент' : nextType === 'order' ? 'Заказ' : nextType === 'offer' ? 'КП' : 'Заявка');
  try {
    if (editType === 'lead') {
      const response = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', editId).single(), 12000, 'Заявка не загрузилась за 12 секунд');
      if (response.error || !response.data) throw response.error || new Error('Заявка не найдена');
      editData = response.data;
      modalHost().innerHTML = leadForm(response.data);
      return;
    }
    if (editType === 'client') {
      let lead = null;
      let client = null;
      if (editId) {
        const leadResponse = await supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', editId).single();
        if (!leadResponse.error) lead = leadResponse.data;
      }
      const clientId = meta.clientId || lead?.converted_client_id;
      if (clientId) {
        const clientResponse = await supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', clientId).single();
        if (!clientResponse.error) client = clientResponse.data;
      }
      editData = { lead, client };
      modalHost().innerHTML = clientForm(client, lead);
      return;
    }
    if (editType === 'order') {
      const response = await timeout(supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', editId).single(), 12000, 'Заказ не загрузился за 12 секунд');
      if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
      editData = response.data;
      modalHost().innerHTML = orderForm(response.data);
      return;
    }
    if (editType === 'offer') {
      const response = await timeout(supabaseClient.from('leader_commercial_offers').select(OFFER_FIELDS).eq('id', editId).single(), 12000, 'КП не загрузилось за 12 секунд');
      if (response.error || !response.data) throw response.error || new Error('КП не найдено');
      editData = response.data;
      modalHost().innerHTML = offerForm(response.data);
    }
  } catch (error) {
    errorBox(friendlyError(error));
  }
}

async function saveLead() {
  const patch = { name: val('edLeadName') || null, phone: val('edLeadPhone') || null, status: val('edLeadStatus') || 'Новая', service: val('edLeadService') || null, source: val('edLeadSource') || null, contact_preference: val('edLeadContact') || null, city: val('edLeadCity') || null, budget: num('edLeadBudget', null), estimated_amount: num('edLeadEstimated', 0), lead_quality: val('edLeadQuality') || 'Не оценена', message: val('edLeadMessage') || null, page_url: val('edLeadPage') || null, updated_at: now() };
  const response = await timeout(supabaseClient.from('leader_leads').update(patch).eq('id', editId).select(LEAD_FIELDS).single(), 12000, 'Заявка не сохранилась');
  if (response.error || !response.data) throw response.error || new Error('Заявка не сохранилась');
  setState({ currentLead: v4State.currentLead?.id === editId ? { ...v4State.currentLead, ...response.data } : v4State.currentLead, leads: (v4State.leads || []).map((item) => item.id === editId ? { ...item, ...response.data } : item) });
  if (response.data.converted_client_id) await supabaseClient.from('leader_clients').update({ name: patch.name, phone: patch.phone, source: patch.source, address: patch.city, updated_at: now() }).eq('id', response.data.converted_client_id);
}
async function saveClient() {
  const patch = { name: val('edClientName') || null, phone: val('edClientPhone') || null, source: val('edClientSource') || null, address: val('edClientAddress') || null, comment: val('edClientComment') || null, updated_at: now() };
  const client = editData?.client;
  const lead = editData?.lead;
  if (client?.id) {
    const response = await timeout(supabaseClient.from('leader_clients').update(patch).eq('id', client.id).select(CLIENT_FIELDS).single(), 12000, 'Клиент не сохранился');
    if (response.error || !response.data) throw response.error || new Error('Клиент не сохранился');
  }
  if (lead?.id) {
    const response = await timeout(supabaseClient.from('leader_leads').update({ name: patch.name, phone: patch.phone, source: patch.source, city: patch.address, updated_at: now() }).eq('id', lead.id).select(LEAD_FIELDS).single(), 12000, 'Заявка клиента не сохранилась');
    if (response.error || !response.data) throw response.error || new Error('Заявка клиента не сохранилась');
  }
}
async function saveOrder() {
  const clientTotal = num('edOrderClientTotal', 0);
  const cost = num('edOrderCost', 0);
  const prepay = num('edOrderPrepay', 0);
  const patch = { project_name: val('edOrderProject') || null, status: val('edOrderStatus') || 'Новый', priority: val('edOrderPriority') || 'Обычный', deadline: date('edOrderDeadline'), client_name: val('edOrderClientName') || null, client_phone: val('edOrderClientPhone') || null, payment_status: val('edOrderPayment') || null, client_total: clientTotal, contractor_cost: cost, profit: clientTotal - cost, prepayment: prepay, balance: num('edOrderBalance', Math.max(clientTotal - prepay, 0)), layout_status: val('edOrderLayoutStatus') || null, layout_link: val('edOrderLayoutLink') || null, layout_comment: val('edOrderLayoutComment') || null, production_status: val('edOrderProductionStatus') || null, current_stage: val('edOrderStage') || null, progress_percent: Math.max(0, Math.min(100, num('edOrderProgress', 0))), next_action: val('edOrderNextAction') || null, production_comment: val('edOrderProductionComment') || null, public_comment: val('edOrderPublicComment') || null, internal_comment: val('edOrderInternalComment') || null, installation_status: val('edOrderInstallStatus') || null, installation_address: val('edOrderInstallAddress') || null, installer_name: val('edOrderInstaller') || null, installer_phone: val('edOrderInstallerPhone') || null, updated_at: now(), stage_updated_at: now() };
  const response = await timeout(supabaseClient.from('leader_orders').update(patch).eq('id', editId).select(ORDER_FIELDS).single(), 12000, 'Заказ не сохранился');
  if (response.error || !response.data) throw response.error || new Error('Заказ не сохранился');
  window.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: response.data } }));
}
async function saveOffer() {
  const oldStatus = editData?.status || null;
  const status = val('edOfferStatus') || 'Черновик';
  const patch = { title: val('edOfferTitle') || 'Коммерческое предложение', offer_type: val('edOfferType') || 'Короткое', status, total_sum: num('edOfferTotal', 0), valid_until: date('edOfferValid'), short_text: val('edOfferShort') || null, full_text: val('edOfferFull') || null, updated_by: v4State.user?.id || null, updated_at: now() };
  if (oldStatus !== status) {
    if (status === 'Отправлено') patch.sent_at = now();
    if (status === 'Согласовано') patch.approved_at = now();
    if (status === 'Отклонено') patch.rejected_at = now();
  }
  const response = await timeout(supabaseClient.from('leader_commercial_offers').update(patch).eq('id', editId).select(OFFER_FIELDS).single(), 12000, 'КП не сохранилось');
  if (response.error || !response.data) throw response.error || new Error('КП не сохранилось');
  if (oldStatus !== status) await supabaseClient.from('leader_commercial_offer_events').insert({ offer_id: editId, lead_id: response.data.lead_id, calculation_id: response.data.calculation_id, event_type: 'Изменение КП', old_status: oldStatus, new_status: status, comment: 'Статус изменён через редактор КП', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
}

function refreshAfterSave(savedType, savedId) {
  if (savedType === 'lead') document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: savedId } }));
  const tabMap = { client: 'clients', order: 'orders', offer: 'offers' };
  const refreshButton = tabMap[savedType] ? document.querySelector(`[data-v4-list-refresh="${tabMap[savedType]}"]`) : null;
  if (refreshButton) setTimeout(() => refreshButton.click(), 120);
  if (document.body.dataset.v4Tab && window.leaderV4OpenTab) setTimeout(() => window.leaderV4OpenTab(document.body.dataset.v4Tab), 220);
}
async function saveCurrent(event) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const savedType = editType;
  const savedId = editId;
  try {
    setStatus('Сохраняю изменения...', 'warn');
    if (editType === 'lead') await saveLead();
    if (editType === 'client') await saveClient();
    if (editType === 'order') await saveOrder();
    if (editType === 'offer') await saveOffer();
    toast('Изменения сохранены');
    setStatus('Изменения сохранены', 'good');
    closeModal();
    refreshAfterSave(savedType, savedId);
  } catch (error) {
    busy = false;
    toast(friendlyError(error));
    setStatus(`Ошибка сохранения: ${friendlyError(error)}`, 'error');
  }
}

async function addEditButtonsForLists() {
  const orders = document.getElementById('ordersListSectionContent');
  if (orders && !orders.dataset.editV3Ready) {
    const response = await supabaseClient.from('leader_orders').select('id').order('created_at', { ascending: false }).limit(100);
    const rows = response.data || [];
    [...orders.querySelectorAll('.v4-crm-list-card')].forEach((card, index) => {
      const rowId = rows[index]?.id || card.querySelector('[data-open-order]')?.dataset.openOrder;
      const actions = card.querySelector('.v4-crm-actions');
      if (rowId && actions && !actions.querySelector('[data-edit-type="order"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="order" data-edit-id="${esc(rowId)}">Редактировать</button>`);
    });
    orders.dataset.editV3Ready = '1';
  }
  const offers = document.getElementById('offersListSectionContent');
  if (offers && !offers.dataset.editV3Ready) {
    const response = await supabaseClient.from('leader_commercial_offers').select('id').order('created_at', { ascending: false }).limit(100);
    const rows = response.data || [];
    [...offers.querySelectorAll('.v4-crm-list-card')].forEach((card, index) => {
      let actions = card.querySelector('.v4-crm-actions');
      if (!actions) { actions = document.createElement('div'); actions.className = 'v4-crm-actions'; card.appendChild(actions); }
      if (rows[index]?.id && !actions.querySelector('[data-edit-type="offer"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="offer" data-edit-id="${esc(rows[index].id)}">Редактировать КП</button>`);
    });
    offers.dataset.editV3Ready = '1';
  }
  const clients = document.getElementById('clientsSectionContent');
  if (clients && !clients.dataset.editV3Ready) {
    const response = await supabaseClient.from('leader_leads').select('id,converted_client_id').order('created_at', { ascending: false }).limit(300);
    const rows = response.data || [];
    [...clients.querySelectorAll('.v4-crm-list-card')].forEach((card) => {
      const leadId = card.querySelector('[data-open-lead]')?.dataset.openLead;
      const leadRow = rows.find((row) => row.id === leadId) || {};
      const actions = card.querySelector('.v4-crm-actions');
      if (leadId && actions && !actions.querySelector('[data-edit-type="client"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="client" data-edit-id="${esc(leadId)}" data-client-id="${esc(leadRow.converted_client_id || '')}">Редактировать клиента</button>`);
    });
    clients.dataset.editV3Ready = '1';
  }
}
function addLeadButtons() {
  document.querySelectorAll('[data-open-lead]').forEach((button) => {
    const actions = button.closest('.v4-crm-actions,.v4-card-view-actions') || button.closest('.v4-crm-list-card,article')?.querySelector('.v4-crm-actions');
    const leadId = button.dataset.openLead || window.LeaderV4CurrentLeadId;
    if (actions && leadId && !actions.querySelector('[data-edit-type="lead"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="lead" data-edit-id="${esc(leadId)}">Редактировать заявку</button>`);
  });
  const cardActions = document.querySelector('#leadCardContent .v4-card-view-actions');
  const currentLead = window.LeaderV4CurrentLeadId || document.body.dataset.currentLeadId;
  if (cardActions && currentLead && !cardActions.querySelector('[data-edit-type="lead"]')) {
    const refresh = document.getElementById('refreshLeadBtn');
    const html = `<button type="button" class="v4-edit-helper-button" data-edit-type="lead" data-edit-id="${esc(currentLead)}">Редактировать заявку</button>`;
    if (refresh) refresh.insertAdjacentHTML('beforebegin', html);
    else cardActions.insertAdjacentHTML('afterbegin', html);
  }
  const orderActions = document.querySelector('#orderCardSection .v4-order-detail-actions');
  if (orderActions && window.LeaderV4CurrentOrderId && !orderActions.querySelector('[data-edit-type="order"]')) orderActions.insertAdjacentHTML('afterbegin', `<button type="button" class="v4-edit-helper-button" data-edit-type="order" data-edit-id="${esc(window.LeaderV4CurrentOrderId)}">Редактировать заказ</button>`);
}
async function enhance(force = false) {
  if (!v4State.crmReady) return;
  const time = Date.now();
  if (!force && time - lastEnhanceAt < 900) return;
  lastEnhanceAt = time;
  addLeadButtons();
  await addEditButtonsForLists().catch(() => {});
}
function resetListMarks() {
  document.querySelectorAll('#ordersListSectionContent,#offersListSectionContent,#clientsSectionContent').forEach((element) => delete element.dataset.editV3Ready);
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', async (event) => {
    const editButton = event.target.closest?.('[data-edit-type]');
    if (editButton) {
      event.preventDefault();
      event.stopPropagation();
      await openEditor(editButton.dataset.editType, editButton.dataset.editId, { clientId: editButton.dataset.clientId || null });
      return;
    }
    if (event.target.closest?.('[data-edit-close]')) closeModal();
  }, true);
  document.addEventListener('submit', (event) => { if (event.target?.id === 'entityEditFormV3') saveCurrent(event); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  document.addEventListener('leader-v4:crm-ready', () => enhance(true));
  document.addEventListener('leader-v4:lead-card-rendered', () => enhance(true));
  document.addEventListener('leader-v4:route-change', () => setTimeout(() => enhance(true), 300));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-list-refresh],[data-v4-tab-button]')) setTimeout(() => { resetListMarks(); enhance(true); }, 800);
  });
  enhance(true);
}
boot();
