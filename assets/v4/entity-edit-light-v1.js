import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

let busy = false;
let editType = '';
let editId = '';
let editData = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function val(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function num(id, fallback = 0) {
  const raw = val(id).replace(',', '.').replace(/\s+/g, '');
  if (raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function ensureStyles() {
  if (document.getElementById('entityEditLightV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'entityEditLightV1Styles';
  style.textContent = `.v4-modal-edit{position:fixed;inset:0;z-index:700;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}.v4-modal-edit-card{width:min(820px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #dbeafe;border-radius:22px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}.v4-modal-edit-head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-modal-edit-head h2{margin:0}.v4-modal-edit-form{display:grid;gap:14px}.v4-modal-edit-form .wide{grid-column:1/-1}.v4-modal-edit-form textarea{min-height:86px;resize:vertical}.v4-modal-edit-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #e2e8f0;padding-top:12px;margin-top:14px}.v4-modal-edit-foot div{display:flex;gap:8px;flex-wrap:wrap}.v4-edit-helper-button{background:#f8fafc}@media(max-width:680px){.v4-modal-edit-card{padding:12px;border-radius:16px}.v4-modal-edit-head,.v4-modal-edit-foot{display:grid}.v4-modal-edit-foot div{display:grid}.v4-modal-edit-foot button{width:100%}}`;
  document.head.appendChild(style);
}

function host() {
  let node = document.getElementById('entityEditLightV1');
  if (!node) {
    node = document.createElement('div');
    node.id = 'entityEditLightV1';
    document.body.appendChild(node);
  }
  return node;
}

function closeModal() {
  editType = '';
  editId = '';
  editData = null;
  busy = false;
  host().innerHTML = '';
}

function shell(title, subtitle, body) {
  return `<div class="v4-modal-edit" role="dialog" aria-modal="true"><div class="v4-modal-edit-card"><div class="v4-modal-edit-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle || '')}</p></div><button type="button" data-edit-close>Закрыть</button></div>${body}<div class="v4-modal-edit-foot"><span class="v4-muted">Изменения сохраняются сразу.</span><div><button type="button" data-edit-close>Отмена</button><button form="entityEditLightForm" type="submit" class="v4-primary" ${busy ? 'disabled' : ''}>${busy ? 'Сохраняю...' : 'Сохранить'}</button></div></div></div></div>`;
}

function loading(title) {
  host().innerHTML = shell(title, 'Загружаю данные...', '<div class="v4-empty">Загрузка...</div>');
}

function errorBox(text) {
  host().innerHTML = shell('Ошибка редактирования', 'Не удалось выполнить действие', `<div class="v4-empty is-error">${esc(text)}</div>`);
}

function options(list, selected) {
  return list.map((item) => `<option ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join('');
}

function leadForm(lead) {
  return shell('Редактировать заявку', lead.name || lead.phone || 'Заявка', `<form id="entityEditLightForm" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edLeadName" value="${esc(lead.name || '')}"></label><label>Телефон<input id="edLeadPhone" value="${esc(lead.phone || '')}"></label><label>Статус<select id="edLeadStatus">${options(['Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено','Ждём ответ','Нужно пересчитать','Согласовано','Создан заказ','Отказ','Не отвечает','Дорого','Передумал','Спам'], lead.status)}</select></label><label>Услуга<input id="edLeadService" value="${esc(lead.service || '')}"></label><label>Источник<input id="edLeadSource" value="${esc(lead.source || '')}"></label><label>Город<input id="edLeadCity" value="${esc(lead.city || '')}"></label><label>Бюджет<input id="edLeadBudget" type="number" value="${lead.budget ?? ''}"></label><label>Оценочная сумма<input id="edLeadEstimated" type="number" value="${lead.estimated_amount ?? ''}"></label><label class="wide">Сообщение клиента<textarea id="edLeadMessage">${esc(lead.message || '')}</textarea></label><label class="wide">Страница / ссылка<input id="edLeadPage" value="${esc(lead.page_url || '')}"></label></div></form>`);
}

function orderForm(order) {
  return shell('Редактировать заказ', `№${order.order_number || String(order.id || '').slice(0, 8)} · ${order.project_name || 'Заказ'}`, `<form id="entityEditLightForm" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название заказа<input id="edOrderProject" value="${esc(order.project_name || '')}"></label><label>Статус<select id="edOrderStatus">${options(['Новый','В работе','Макет на согласовании','В производстве','Готово','Выдано','Закрыт','Отменён'], order.status)}</select></label><label>Срок<input id="edOrderDeadline" type="date" value="${esc(order.deadline || '')}"></label><label>Клиент<input id="edOrderClientName" value="${esc(order.client_name || '')}"></label><label>Телефон клиента<input id="edOrderClientPhone" value="${esc(order.client_phone || '')}"></label><label>Оплата<select id="edOrderPayment">${options(['Не оплачено','Предоплата','Частично оплачено','Оплачено','Долг','Возврат'], order.payment_status)}</select></label><label>Клиенту, ₽<input id="edOrderClientTotal" type="number" value="${order.client_total ?? 0}"></label><label>Себестоимость, ₽<input id="edOrderCost" type="number" value="${order.contractor_cost ?? 0}"></label><label>Статус макета<select id="edOrderLayoutStatus">${options(['Макета нет','Нужно подготовить','В работе','На согласовании','Макет согласован','Готов'], order.layout_status)}</select></label><label class="wide">Производственный комментарий<textarea id="edOrderProductionComment">${esc(order.production_comment || '')}</textarea></label><label class="wide">Публичный комментарий<textarea id="edOrderPublicComment">${esc(order.public_comment || '')}</textarea></label><label class="wide">Внутренний комментарий<textarea id="edOrderInternalComment">${esc(order.internal_comment || '')}</textarea></label></div></form>`);
}

function clientForm(lead) {
  return shell('Редактировать клиента', lead.name || lead.phone || 'Клиент', `<form id="entityEditLightForm" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Имя / организация<input id="edClientName" value="${esc(lead.name || '')}"></label><label>Телефон<input id="edClientPhone" value="${esc(lead.phone || '')}"></label><label>Источник<input id="edClientSource" value="${esc(lead.source || '')}"></label><label>Город<input id="edClientCity" value="${esc(lead.city || '')}"></label><label class="wide">Комментарий<textarea id="edClientComment">${esc(lead.message || '')}</textarea></label></div></form>`);
}

function offerForm(offer) {
  return shell('Редактировать КП', offer.title || 'Коммерческое предложение', `<form id="entityEditLightForm" class="v4-modal-edit-form"><div class="v4-form-grid"><label>Название<input id="edOfferTitle" value="${esc(offer.title || '')}"></label><label>Статус<select id="edOfferStatus">${options(['Черновик','Отправлено','На согласовании','Согласовано','Отклонено','Устарело'], offer.status)}</select></label><label>Сумма<input id="edOfferTotal" type="number" value="${offer.total_sum ?? 0}"></label><label>Действует до<input id="edOfferValid" type="date" value="${esc(offer.valid_until || '')}"></label><label class="wide">Короткий текст<textarea id="edOfferShort">${esc(offer.short_text || '')}</textarea></label><label class="wide">Полный текст<textarea id="edOfferFull" rows="7">${esc(offer.full_text || '')}</textarea></label></div></form>`);
}

async function openEditor(nextType, nextId) {
  editType = nextType;
  editId = nextId;
  editData = null;
  ensureStyles();
  loading(nextType === 'client' ? 'Клиент' : nextType === 'order' ? 'Заказ' : nextType === 'offer' ? 'КП' : 'Заявка');
  try {
    if (editType === 'lead' || editType === 'client') {
      const response = await supabaseClient.from('leader_leads').select('id,name,phone,source,message,page_url,status,created_at,updated_at,service,city,budget,estimated_amount,next_contact_at,lead_quality').eq('id', editId).single();
      if (response.error || !response.data) throw response.error || new Error('Заявка не найдена');
      editData = response.data;
      host().innerHTML = editType === 'client' ? clientForm(response.data) : leadForm(response.data);
      return;
    }
    if (editType === 'order') {
      const response = await supabaseClient.from('leader_orders').select('id,order_number,project_name,client_name,client_phone,status,payment_status,deadline,contractor_cost,client_total,profit,layout_status,production_comment,internal_comment,public_comment').eq('id', editId).single();
      if (response.error || !response.data) throw response.error || new Error('Заказ не найден');
      editData = response.data;
      host().innerHTML = orderForm(response.data);
      return;
    }
    if (editType === 'offer') {
      const response = await supabaseClient.from('leader_commercial_offers').select('id,title,status,total_sum,valid_until,short_text,full_text,lead_id,calculation_id').eq('id', editId).single();
      if (response.error || !response.data) throw response.error || new Error('КП не найдено');
      editData = response.data;
      host().innerHTML = offerForm(response.data);
    }
  } catch (error) {
    errorBox(friendlyError(error));
  }
}

async function saveCurrent(event) {
  event.preventDefault();
  if (busy || !editType || !editId) return;
  busy = true;
  try {
    setStatus('Сохраняю изменения...', 'warn');
    if (editType === 'lead' || editType === 'client') {
      const patch = editType === 'client'
        ? { name: val('edClientName'), phone: val('edClientPhone'), source: val('edClientSource'), city: val('edClientCity'), message: val('edClientComment'), updated_at: new Date().toISOString() }
        : { name: val('edLeadName'), phone: val('edLeadPhone'), status: val('edLeadStatus'), service: val('edLeadService'), source: val('edLeadSource'), city: val('edLeadCity'), budget: num('edLeadBudget', 0), estimated_amount: num('edLeadEstimated', 0), message: val('edLeadMessage'), page_url: val('edLeadPage'), updated_at: new Date().toISOString() };
      const response = await supabaseClient.from('leader_leads').update(patch).eq('id', editId).select('id').single();
      if (response.error) throw response.error;
    }
    if (editType === 'order') {
      const patch = { project_name: val('edOrderProject'), status: val('edOrderStatus'), deadline: val('edOrderDeadline') || null, client_name: val('edOrderClientName'), client_phone: val('edOrderClientPhone'), payment_status: val('edOrderPayment'), client_total: num('edOrderClientTotal', 0), contractor_cost: num('edOrderCost', 0), profit: num('edOrderClientTotal', 0) - num('edOrderCost', 0), layout_status: val('edOrderLayoutStatus'), production_comment: val('edOrderProductionComment'), public_comment: val('edOrderPublicComment'), internal_comment: val('edOrderInternalComment'), updated_at: new Date().toISOString() };
      const response = await supabaseClient.from('leader_orders').update(patch).eq('id', editId).select('id').single();
      if (response.error) throw response.error;
    }
    if (editType === 'offer') {
      const patch = { title: val('edOfferTitle'), status: val('edOfferStatus'), total_sum: num('edOfferTotal', 0), valid_until: val('edOfferValid') || null, short_text: val('edOfferShort'), full_text: val('edOfferFull'), updated_at: new Date().toISOString() };
      const response = await supabaseClient.from('leader_commercial_offers').update(patch).eq('id', editId).select('id').single();
      if (response.error) throw response.error;
    }
    toast('Изменения сохранены');
    setStatus('Изменения сохранены', 'good');
    closeModal();
    document.querySelector(`[data-v4-list-refresh="${editType === 'offer' ? 'offers' : editType === 'order' ? 'orders' : editType === 'client' ? 'clients' : 'leads'}"]`)?.click();
  } catch (error) {
    busy = false;
    toast(friendlyError(error));
    setStatus(`Ошибка сохранения: ${friendlyError(error)}`, 'error');
  }
}

function addListButtons() {
  document.querySelectorAll('#ordersListSectionContent [data-open-order]').forEach((button) => {
    const actions = button.closest('.v4-crm-actions');
    const id = button.dataset.openOrder;
    if (actions && id && !actions.querySelector('[data-edit-type="order"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="order" data-edit-id="${esc(id)}">Редактировать</button>`);
  });
  document.querySelectorAll('#clientsSectionContent [data-open-lead]').forEach((button) => {
    const actions = button.closest('.v4-crm-actions');
    const id = button.dataset.openLead;
    if (actions && id && !actions.querySelector('[data-edit-type="client"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="client" data-edit-id="${esc(id)}">Редактировать клиента</button>`);
  });
  document.querySelectorAll('[data-open-lead]').forEach((button) => {
    const actions = button.closest('.v4-crm-actions,.v4-card-view-actions') || button.closest('.v4-crm-list-card,article')?.querySelector('.v4-crm-actions');
    const id = button.dataset.openLead || window.LeaderV4CurrentLeadId || document.body.dataset.currentLeadId;
    if (actions && id && !actions.querySelector('[data-edit-type="lead"]')) actions.insertAdjacentHTML('beforeend', `<button type="button" class="v4-edit-helper-button" data-edit-type="lead" data-edit-id="${esc(id)}">Редактировать заявку</button>`);
  });
}

function boot() {
  ensureStyles();
  document.addEventListener('click', (event) => {
    const edit = event.target.closest?.('[data-edit-type]');
    if (edit) {
      event.preventDefault();
      openEditor(edit.dataset.editType, edit.dataset.editId);
      return;
    }
    if (event.target.closest?.('[data-edit-close]')) closeModal();
  });
  document.addEventListener('submit', (event) => {
    if (event.target.id === 'entityEditLightForm') saveCurrent(event);
  });
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(addListButtons, 250));
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(addListButtons, 250));
  document.addEventListener('click', () => setTimeout(addListButtons, 300));
  window.setInterval(addListButtons, 4000);
}

if (!window.LeaderV4EntityEditLightV1Booted) {
  window.LeaderV4EntityEditLightV1Booted = true;
  boot();
}
