import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,converted_order_id,converted_client_id,next_contact_at,reject_reason,lead_quality,estimated_amount';
const CLIENT_FIELDS = 'id,name,phone,source,address,comment,created_at,updated_at';
const ORDER_FIELDS = 'id,order_number,lead_id,client_id,project_name,client_name,client_phone,status,payment_status,deadline,contractor_cost,client_total,profit,prepayment,balance,source,layout_status,layout_link,layout_comment,production_comment,internal_comment,public_comment,production_status,priority,production_priority,current_stage,next_action,progress_percent,installation_status,installation_address,installer_name,installer_phone,data,created_at,updated_at';
const OFFER_FIELDS = 'id,lead_id,calculation_id,client_id,order_id,offer_number,offer_type,title,short_text,full_text,total_sum,valid_until,status,sent_at,approved_at,rejected_at,created_at,updated_at';

let modalOpen = false;
let modalType = '';
let modalId = '';
let modalData = null;
let modalBusy = false;
let injected = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function num(value) {
  const raw = String(value ?? '').replace(',', '.').replace(/\s+/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
function value(id) { return byId(id)?.value?.trim() || ''; }
function numberValue(id, fallback = 0) { const n = num(value(id)); return n == null ? fallback : n; }
function dateValue(id) { return value(id) || null; }
function nowIso() { return new Date().toISOString(); }
function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`; }

function ensureStyles() {
  if (document.getElementById('entityEditStyles')) return;
  const style = document.createElement('style');
  style.id = 'entityEditStyles';
  style.textContent = `
    .v4-entity-modal{position:fixed;inset:0;z-index:500;background:rgba(15,23,42,.54);display:grid;place-items:center;padding:16px}
    .v4-entity-dialog{width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(15,23,42,.35);padding:18px;border:1px solid #dbeafe}
    .v4-entity-dialog-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}
    .v4-entity-dialog-head h2{margin:0;font-size:22px}.v4-entity-dialog-head p{margin:6px 0 0;color:#64748b}.v4-entity-close{border-radius:999px;padding:8px 12px}
    .v4-entity-form{display:grid;gap:14px}.v4-entity-form .wide{grid-column:1/-1}.v4-entity-form textarea{min-height:82px;resize:vertical}
    .v4-entity-footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:4px}
    .v4-entity-footer div{display:flex;gap:8px;flex-wrap:wrap}.v4-entity-note{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;padding:10px 12px;font-weight:800;line-height:1.45}
    .v4-crm-actions [data-entity-edit], .v4-card-view-actions [data-entity-edit], .v4-order-detail-actions [data-entity-edit]{background:#f8fafc}
    @media(max-width:680px){.v4-entity-dialog{padding:12px;border-radius:16px}.v4-entity-dialog-head{display:grid;grid-template-columns:1fr}.v4-entity-footer{display:grid}.v4-entity-footer div{display:grid}.v4-entity-footer button{width:100%}}
  `;
  document.head.appendChild(style);
}

function modalShell(title, subtitle, body, footer = '') {
  return `
    <div class="v4-entity-modal" role="dialog" aria-modal="true">
      <div class="v4-entity-dialog">
        <div class="v4-entity-dialog-head">
          <div><h2>${esc(title)}</h2><p>${esc(subtitle || '')}</p></div>
          <button type="button" class="v4-entity-close" data-entity-close>Закрыть</button>
        </div>
        ${body}
        ${footer}
      </div>
    </div>`;
}
function ensureModalHost() {
  let host = document.getElementById('entityEditModal');
  if (!host) {
    host = document.createElement('div');
    host.id = 'entityEditModal';
    document.body.appendChild(host);
  }
  return host;
}
function closeModal() {
  modalOpen = false;
  modalType = '';
  modalId = '';
  modalData = null;
  modalBusy = false;
  const host = ensureModalHost();
  host.innerHTML = '';
}
function renderLoading(title = 'Редактирование') {
  ensureModalHost().innerHTML = modalShell(title, 'Загружаю данные...', '<div class="v4-empty">Загрузка...</div>');
}
function renderError(message) {
  ensureModalHost().innerHTML = modalShell('Ошибка', 'Данные не удалось загрузить или сохранить', `<div class="v4-empty is-error">${esc(message)}</div>`);
}
function footer(saveLabel = 'Сохранить') {
  return `<div class="v4-entity-footer"><span class="v4-muted">Изменения сохраняются сразу в Supabase.</span><div><button type="button" data-entity-close>Отмена</button><button type="submit" form="entityEditForm" class="v4-primary" ${modalBusy ? 'disabled' : ''}>${modalBusy ? 'Сохраняю...' : saveLabel}</button></div></div>`;
}

function leadForm(lead) {
  return modalShell('Редактировать заявку', lead.name || lead.phone || 'Заявка', `
    <form id="entityEditForm" class="v4-entity-form" data-save-type="lead">
      <div class="v4-form-grid">
        <label>Имя / организация<input id="entityLeadName" value="${esc(lead.name || '')}"></label>
        <label>Телефон<input id="entityLeadPhone" value="${esc(lead.phone || '')}"></label>
        <label>Статус<select id="entityLeadStatus">${['Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено','Ждём ответ','Нужно пересчитать','Согласовано','Создан заказ','Отказ','Спам'].map((s) => `<option ${lead.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Услуга<input id="entityLeadService" value="${esc(lead.service || '')}"></label>
        <label>Источник<input id="entityLeadSource" value="${esc(lead.source || '')}"></label>
        <label>Связь<input id="entityLeadContact" value="${esc(lead.contact_preference || '')}" placeholder="MAX / телефон"></label>
        <label>Город<input id="entityLeadCity" value="${esc(lead.city || '')}"></label>
        <label>Бюджет<input id="entityLeadBudget" type="number" step="1" value="${lead.budget ?? ''}"></label>
        <label>Оценочная сумма<input id="entityLeadEstimated" type="number" step="1" value="${lead.estimated_amount ?? ''}"></label>
        <label>Качество<select id="entityLeadQuality">${['Не оценена','Холодная','Средняя','Тёплая','Горячая'].map((s) => `<option ${lead.lead_quality === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="wide">Сообщение клиента<textarea id="entityLeadMessage">${esc(lead.message || '')}</textarea></label>
        <label class="wide">Страница / ссылка<input id="entityLeadPage" value="${esc(lead.page_url || '')}"></label>
      </div>
    </form>`, footer('Сохранить заявку'));
}

function clientForm(client, lead = null) {
  const title = client?.id ? 'Редактировать клиента' : 'Редактировать данные клиента в заявке';
  const source = client || lead || {};
  return modalShell(title, source.name || source.phone || 'Клиент', `
    ${!client?.id ? '<div class="v4-entity-note">У этой карточки нет отдельного клиента в leader_clients. Изменения будут сохранены в последнюю связанную заявку. Если заявка связана с клиентом — обновится и клиент.</div>' : ''}
    <form id="entityEditForm" class="v4-entity-form" data-save-type="client">
      <div class="v4-form-grid">
        <label>Имя / организация<input id="entityClientName" value="${esc(source.name || '')}"></label>
        <label>Телефон<input id="entityClientPhone" value="${esc(source.phone || '')}"></label>
        <label>Источник<input id="entityClientSource" value="${esc(source.source || '')}"></label>
        <label>Город / адрес<input id="entityClientAddress" value="${esc(source.address || source.city || '')}"></label>
        <label class="wide">Комментарий<textarea id="entityClientComment">${esc(source.comment || source.message || '')}</textarea></label>
      </div>
    </form>`, footer('Сохранить клиента'));
}

function orderForm(order) {
  const profit = Number(order.profit || 0);
  return modalShell('Редактировать заказ', `№${order.order_number || String(order.id).slice(0, 8)} · ${order.project_name || 'Заказ'}`, `
    <form id="entityEditForm" class="v4-entity-form" data-save-type="order">
      <div class="v4-form-grid">
        <label>Название заказа<input id="entityOrderProject" value="${esc(order.project_name || '')}"></label>
        <label>Статус<select id="entityOrderStatus">${['Новый','В работе','Макет на согласовании','В производстве','Готово','Выдано','Закрыт','Отменён'].map((s) => `<option ${order.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Приоритет<select id="entityOrderPriority">${['Низкий','Обычный','Высокий','Срочно'].map((s) => `<option ${order.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Срок<input id="entityOrderDeadline" type="date" value="${esc(order.deadline || '')}"></label>
        <label>Клиент<input id="entityOrderClientName" value="${esc(order.client_name || '')}"></label>
        <label>Телефон клиента<input id="entityOrderClientPhone" value="${esc(order.client_phone || '')}"></label>
        <label>Оплата<select id="entityOrderPayment">${['Не оплачено','Предоплата','Частично оплачено','Оплачено','Долг','Возврат'].map((s) => `<option ${order.payment_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Клиенту, ₽<input id="entityOrderClientTotal" type="number" step="1" value="${order.client_total ?? 0}"></label>
        <label>Себестоимость, ₽<input id="entityOrderCost" type="number" step="1" value="${order.contractor_cost ?? 0}"></label>
        <label>Прибыль, ₽<input id="entityOrderProfit" type="number" step="1" value="${profit}"></label>
        <label>Предоплата, ₽<input id="entityOrderPrepay" type="number" step="1" value="${order.prepayment ?? 0}"></label>
        <label>Остаток, ₽<input id="entityOrderBalance" type="number" step="1" value="${order.balance ?? 0}"></label>
        <label>Статус макета<select id="entityOrderLayoutStatus">${['Макета нет','Нужно подготовить','В работе','На согласовании','Макет согласован','Готов'].map((s) => `<option ${order.layout_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="wide">Ссылка на макет / облако<input id="entityOrderLayoutLink" value="${esc(order.layout_link || '')}" placeholder="https://..."></label>
        <label class="wide">Комментарий к макету<textarea id="entityOrderLayoutComment">${esc(order.layout_comment || '')}</textarea></label>
        <label>Статус производства<input id="entityOrderProductionStatus" value="${esc(order.production_status || '')}"></label>
        <label>Этап<input id="entityOrderStage" value="${esc(order.current_stage || '')}"></label>
        <label>Прогресс, %<input id="entityOrderProgress" type="number" min="0" max="100" step="1" value="${order.progress_percent ?? 0}"></label>
        <label>Следующее действие<input id="entityOrderNextAction" value="${esc(order.next_action || '')}"></label>
        <label class="wide">Производственный комментарий<textarea id="entityOrderProductionComment">${esc(order.production_comment || '')}</textarea></label>
        <label class="wide">Публичный комментарий<textarea id="entityOrderPublicComment">${esc(order.public_comment || '')}</textarea></label>
        <label class="wide">Внутренний комментарий<textarea id="entityOrderInternalComment">${esc(order.internal_comment || '')}</textarea></label>
        <label>Статус монтажа<input id="entityOrderInstallStatus" value="${esc(order.installation_status || '')}"></label>
        <label class="wide">Адрес монтажа<input id="entityOrderInstallAddress" value="${esc(order.installation_address || '')}"></label>
        <label>Монтажник<input id="entityOrderInstaller" value="${esc(order.installer_name || '')}"></label>
        <label>Телефон монтажника<input id="entityOrderInstallerPhone" value="${esc(order.installer_phone || '')}"></label>
      </div>
    </form>`, footer('Сохранить заказ'));
}

function offerForm(offer) {
  return modalShell('Редактировать КП', offer.title || `КП №${offer.offer_number || ''}`, `
    <form id="entityEditForm" class="v4-entity-form" data-save-type="offer">
      <div class="v4-form-grid">
        <label>Название<input id="entityOfferTitle" value="${esc(offer.title || '')}"></label>
        <label>Тип КП<select id="entityOfferType">${['Короткое','Подробное','Для печати','Индивидуальное'].map((s) => `<option ${offer.offer_type === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Статус<select id="entityOfferStatus">${['Черновик','Отправлено','На согласовании','Согласовано','Отклонено','Устарело'].map((s) => `<option ${offer.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Сумма КП<input id="entityOfferTotal" type="number" step="1" value="${offer.total_sum ?? 0}"></label>
        <label>Действует до<input id="entityOfferValid" type="date" value="${esc(offer.valid_until || '')}"></label>
        <label class="wide">Короткий текст<textarea id="entityOfferShort">${esc(offer.short_text || '')}</textarea></label>
        <label class="wide">Полный текст<textarea id="entityOfferFull" rows="7">${esc(offer.full_text || '')}</textarea></label>
      </div>
    </form>`, footer('Сохранить КП'));
}

async function openEditor(type, id, extra = {}) {
  modalOpen = true;
  modalType = type;
  modalId = id;
  modalData = null;
  ensureStyles();
  renderLoading(type === 'client' ? 'Клиент' : type === 'order' ? 'Заказ' : type === 'offer' ? 'КП' : 'Заявка');
  try {
    let data = null;
    let lead = null;
    if (type === 'lead') {
      const response = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', id).single(), 12000, 'Заявка не загрузилась за 12 секунд');
      if (response.error) throw response.error;
      data = response.data;
      ensureModalHost().innerHTML = leadForm(data);
    }
    if (type === 'client') {
      if (extra.clientId) {
        const response = await timeout(supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', extra.clientId).single(), 12000, 'Клиент не загрузился за 12 секунд');
        if (response.error) throw response.error;
        data = response.data;
      }
      if (id) {
        const leadResponse = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', id).single(), 12000, 'Заявка клиента не загрузилась за 12 секунд');
        if (!leadResponse.error) lead = leadResponse.data;
      }
      if (!data && lead?.converted_client_id) {
        const response = await timeout(supabaseClient.from('leader_clients').select(CLIENT_FIELDS).eq('id', lead.converted_client_id).single(), 12000, 'Клиент не загрузился за 12 секунд');
        if (!response.error) data = response.data;
      }
      modalData = { client: data, lead };
      ensureModalHost().innerHTML = clientForm(data, lead);
      return;
    }
    if (type === 'order') {
      const response = await timeout(supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', id).single(), 12000, 'Заказ не загрузился за 12 секунд');
      if (response.error) throw response.error;
      data = response.data;
      ensureModalHost().innerHTML = orderForm(data);
    }
    if (type === 'offer') {
      const response = await timeout(supabaseClient.from('leader_commercial_offers').select(OFFER_FIELDS).eq('id', id).single(), 12000, 'КП не загрузилось за 12 секунд');
      if (response.error) throw response.error;
      data = response.data;
      ensureModalHost().innerHTML = offerForm(data);
    }
    modalData = data;
  } catch (error) {
    renderError(friendlyError(error));
  }
}

async function saveLead() {
  const patch = {
    name: value('entityLeadName') || null,
    phone: value('entityLeadPhone') || null,
    status: value('entityLeadStatus') || 'Новая',
    service: value('entityLeadService') || null,
    source: value('entityLeadSource') || null,
    contact_preference: value('entityLeadContact') || null,
    city: value('entityLeadCity') || null,
    budget: num(value('entityLeadBudget')),
    estimated_amount: numberValue('entityLeadEstimated', 0),
    lead_quality: value('entityLeadQuality') || 'Не оценена',
    message: value('entityLeadMessage') || null,
    page_url: value('entityLeadPage') || null,
    updated_at: nowIso()
  };
  const response = await timeout(supabaseClient.from('leader_leads').update(patch).eq('id', modalId).select(LEAD_FIELDS).single(), 12000, 'Заявка не сохранилась за 12 секунд');
  if (response.error) throw response.error;
  setState({ currentLead: v4State.currentLead?.id === modalId ? { ...v4State.currentLead, ...response.data } : v4State.currentLead, leads: (v4State.leads || []).map((lead) => lead.id === modalId ? { ...lead, ...response.data } : lead) });
  if (response.data.converted_client_id) {
    await supabaseClient.from('leader_clients').update({ name: patch.name, phone: patch.phone, source: patch.source, address: patch.city, updated_at: nowIso() }).eq('id', response.data.converted_client_id);
  }
}

async function saveClient() {
  const patch = {
    name: value('entityClientName') || null,
    phone: value('entityClientPhone') || null,
    source: value('entityClientSource') || null,
    address: value('entityClientAddress') || null,
    comment: value('entityClientComment') || null,
    updated_at: nowIso()
  };
  const client = modalData?.client;
  const lead = modalData?.lead;
  if (client?.id) {
    const response = await timeout(supabaseClient.from('leader_clients').update(patch).eq('id', client.id).select(CLIENT_FIELDS).single(), 12000, 'Клиент не сохранился за 12 секунд');
    if (response.error) throw response.error;
    if (lead?.id) await supabaseClient.from('leader_leads').update({ name: patch.name, phone: patch.phone, source: patch.source, city: patch.address, updated_at: nowIso() }).eq('id', lead.id);
    return;
  }
  if (lead?.id) {
    const response = await timeout(supabaseClient.from('leader_leads').update({ name: patch.name, phone: patch.phone, source: patch.source, city: patch.address, message: patch.comment, updated_at: nowIso() }).eq('id', lead.id).select(LEAD_FIELDS).single(), 12000, 'Данные клиента в заявке не сохранились за 12 секунд');
    if (response.error) throw response.error;
    return;
  }
  throw new Error('Клиент или связанная заявка не найдены');
}

async function saveOrder() {
  const clientTotal = numberValue('entityOrderClientTotal', 0);
  const cost = numberValue('entityOrderCost', 0);
  const profit = numberValue('entityOrderProfit', clientTotal - cost);
  const prepay = numberValue('entityOrderPrepay', 0);
  const balance = numberValue('entityOrderBalance', Math.max(clientTotal - prepay, 0));
  const patch = {
    project_name: value('entityOrderProject') || null,
    status: value('entityOrderStatus') || 'Новый',
    priority: value('entityOrderPriority') || 'Обычный',
    deadline: dateValue('entityOrderDeadline'),
    client_name: value('entityOrderClientName') || null,
    client_phone: value('entityOrderClientPhone') || null,
    payment_status: value('entityOrderPayment') || null,
    client_total: clientTotal,
    contractor_cost: cost,
    profit,
    prepayment: prepay,
    balance,
    layout_status: value('entityOrderLayoutStatus') || null,
    layout_link: value('entityOrderLayoutLink') || null,
    layout_comment: value('entityOrderLayoutComment') || null,
    production_status: value('entityOrderProductionStatus') || null,
    current_stage: value('entityOrderStage') || null,
    progress_percent: Math.max(0, Math.min(100, Number(numberValue('entityOrderProgress', 0)))) || 0,
    next_action: value('entityOrderNextAction') || null,
    production_comment: value('entityOrderProductionComment') || null,
    public_comment: value('entityOrderPublicComment') || null,
    internal_comment: value('entityOrderInternalComment') || null,
    installation_status: value('entityOrderInstallStatus') || null,
    installation_address: value('entityOrderInstallAddress') || null,
    installer_name: value('entityOrderInstaller') || null,
    installer_phone: value('entityOrderInstallerPhone') || null,
    updated_at: nowIso(),
    stage_updated_at: nowIso()
  };
  const response = await timeout(supabaseClient.from('leader_orders').update(patch).eq('id', modalId).select(ORDER_FIELDS).single(), 12000, 'Заказ не сохранился за 12 секунд');
  if (response.error) throw response.error;
  window.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: response.data } }));
}

async function saveOffer() {
  const oldStatus = modalData?.status || null;
  const newStatus = value('entityOfferStatus') || 'Черновик';
  const patch = {
    title: value('entityOfferTitle') || 'Коммерческое предложение',
    offer_type: value('entityOfferType') || 'Короткое',
    status: newStatus,
    total_sum: numberValue('entityOfferTotal', 0),
    valid_until: dateValue('entityOfferValid'),
    short_text: value('entityOfferShort') || null,
    full_text: value('entityOfferFull') || null,
    updated_by: v4State.user?.id || null,
    updated_at: nowIso()
  };
  if (oldStatus !== newStatus) {
    if (newStatus === 'Отправлено') patch.sent_at = nowIso();
    if (newStatus === 'Согласовано') patch.approved_at = nowIso();
    if (newStatus === 'Отклонено') patch.rejected_at = nowIso();
  }
  const response = await timeout(supabaseClient.from('leader_commercial_offers').update(patch).eq('id', modalId).select(OFFER_FIELDS).single(), 12000, 'КП не сохранилось за 12 секунд');
  if (response.error) throw response.error;
  if (oldStatus !== newStatus) {
    await supabaseClient.from('leader_commercial_offer_events').insert({ offer_id: modalId, lead_id: response.data.lead_id, calculation_id: response.data.calculation_id, event_type: 'Изменение КП', old_status: oldStatus, new_status: newStatus, comment: 'Статус изменён через редактор КП', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
  }
}

async function saveCurrent(event) {
  event.preventDefault();
  if (modalBusy) return;
  modalBusy = true;
  try {
    setStatus('Сохраняю изменения...', 'warn');
    if (modalType === 'lead') await saveLead();
    if (modalType === 'client') await saveClient();
    if (modalType === 'order') await saveOrder();
    if (modalType === 'offer') await saveOffer();
    setStatus('Изменения сохранены', 'good');
    toast('Изменения сохранены');
    closeModal();
    refreshCurrentScreens();
  } catch (error) {
    setStatus(`Ошибка сохранения: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
    modalBusy = false;
  }
}

function refreshCurrentScreens() {
  const active = document.body.dataset.v4Tab;
  if (modalType === 'lead') {
    document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: modalId } }));
  }
  const refreshMap = { client: 'clients', order: 'orders', offer: 'offers' };
  const key = refreshMap[modalType];
  if (key) {
    const button = document.querySelector(`[data-v4-list-refresh="${key}"]`);
    if (button) button.click();
  }
  if (active && window.leaderV4OpenTab) window.leaderV4OpenTab(active);
}

async function loadListIds() {
  const ordersSection = document.getElementById('ordersListSectionContent');
  if (ordersSection && !ordersSection.dataset.entityEditReady) {
    const response = await supabaseClient.from('leader_orders').select('id').order('created_at', { ascending: false }).limit(100);
    const rows = response.data || [];
    [...ordersSection.querySelectorAll('.v4-crm-list-card')].forEach((card, index) => {
      const id = rows[index]?.id || card.querySelector('[data-open-order]')?.dataset.openOrder;
      const actions = card.querySelector('.v4-crm-actions');
      if (id && actions && !actions.querySelector('[data-entity-edit="order"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" data-entity-edit="order" data-entity-id="${esc(id)}">Редактировать</button>`);
    });
    ordersSection.dataset.entityEditReady = '1';
  }

  const offersSection = document.getElementById('offersListSectionContent');
  if (offersSection && !offersSection.dataset.entityEditReady) {
    const response = await supabaseClient.from('leader_commercial_offers').select('id').order('created_at', { ascending: false }).limit(100);
    const rows = response.data || [];
    [...offersSection.querySelectorAll('.v4-crm-list-card')].forEach((card, index) => {
      const id = rows[index]?.id;
      let actions = card.querySelector('.v4-crm-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'v4-crm-actions';
        card.appendChild(actions);
      }
      if (id && !actions.querySelector('[data-entity-edit="offer"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" data-entity-edit="offer" data-entity-id="${esc(id)}">Редактировать КП</button>`);
    });
    offersSection.dataset.entityEditReady = '1';
  }

  const clientsSection = document.getElementById('clientsSectionContent');
  if (clientsSection && !clientsSection.dataset.entityEditReady) {
    const response = await supabaseClient.from('leader_leads').select('id,converted_client_id').order('created_at', { ascending: false }).limit(300);
    const rows = response.data || [];
    [...clientsSection.querySelectorAll('.v4-crm-list-card')].forEach((card) => {
      const leadId = card.querySelector('[data-open-lead]')?.dataset.openLead;
      const leadRow = rows.find((row) => row.id === leadId) || {};
      const actions = card.querySelector('.v4-crm-actions');
      if (leadId && actions && !actions.querySelector('[data-entity-edit="client"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" data-entity-edit="client" data-entity-id="${esc(leadId)}" data-client-id="${esc(leadRow.converted_client_id || '')}">Редактировать клиента</button>`);
    });
    clientsSection.dataset.entityEditReady = '1';
  }
}

function enhanceLeadButtons() {
  document.querySelectorAll('[data-open-lead]').forEach((button) => {
    const card = button.closest('.v4-crm-list-card, .v4-lead-card, article');
    const actions = button.closest('.v4-crm-actions, .v4-card-view-actions, .v4-lead-actions') || card?.querySelector('.v4-crm-actions');
    const id = button.dataset.openLead;
    if (id && actions && !actions.querySelector(`[data-entity-edit="lead"][data-entity-id="${CSS.escape(id)}"]`)) {
      actions.insertAdjacentHTML('beforeend', `<button type="button" data-entity-edit="lead" data-entity-id="${esc(id)}">Редактировать заявку</button>`);
    }
  });
  const orderActions = document.querySelector('.v4-order-detail-actions');
  const orderId = document.querySelector('[data-open-order]')?.dataset.openOrder || window.currentOrder?.id;
  if (orderActions && !orderActions.querySelector('[data-entity-edit="order"]')) {
    const selected = document.querySelector('#orderCardSection [data-print-order-task]');
    const fallbackId = selected ? null : null;
    const explicitId = window.LeaderV4CurrentOrderId || fallbackId;
    if (explicitId) orderActions.insertAdjacentHTML('afterbegin', `<button type="button" data-entity-edit="order" data-entity-id="${esc(explicitId)}">Редактировать заказ</button>`);
  }
}

function runEnhancers() {
  if (!v4State.crmReady) return;
  loadListIds().catch(() => {});
  enhanceLeadButtons();
}

function bind() {
  ensureStyles();
  if (injected) return;
  injected = true;
  document.addEventListener('click', async (event) => {
    const edit = event.target.closest?.('[data-entity-edit]');
    if (edit) {
      event.preventDefault();
      event.stopPropagation();
      await openEditor(edit.dataset.entityEdit, edit.dataset.entityId, { clientId: edit.dataset.clientId || null });
      return;
    }
    if (event.target.closest?.('[data-entity-close]')) {
      closeModal();
    }
  }, true);
  document.addEventListener('submit', async (event) => {
    if (event.target?.id === 'entityEditForm') await saveCurrent(event);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalOpen) closeModal();
  });
  document.addEventListener('leader-v4:lead-card-rendered', runEnhancers);
  document.addEventListener('leader-v4:route-change', () => setTimeout(runEnhancers, 250));
  document.addEventListener('leader-v4:crm-ready', runEnhancers);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-list-refresh],[data-v4-tab-button]')) setTimeout(() => {
      document.querySelectorAll('#ordersListSectionContent,#offersListSectionContent,#clientsSectionContent').forEach((el) => delete el.dataset.entityEditReady);
      runEnhancers();
    }, 700);
  });
  setInterval(runEnhancers, 2000);
}

bind();
