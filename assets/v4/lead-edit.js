import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,utm_source,utm_medium,utm_campaign,utm_content,utm_term,assigned_to,converted_order_id,converted_client_id,last_contact_at,next_contact_at,converted_at,reject_reason,lead_quality,estimated_amount';
let editOpen = false;
let saveBusy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function value(id) { return byId(id)?.value?.trim() || ''; }
function numberOrNull(id) {
  const raw = value(id).replace(',', '.').replace(/\s+/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function ensureButton() {
  const actions = byId('leadCardContent')?.querySelector('.v4-card-view-actions');
  if (!actions || byId('editLeadBtn')) return;
  const refresh = byId('refreshLeadBtn');
  const button = document.createElement('button');
  button.id = 'editLeadBtn';
  button.type = 'button';
  button.textContent = 'Редактировать заявку';
  if (refresh) refresh.insertAdjacentElement('beforebegin', button);
  else actions.insertAdjacentElement('afterbegin', button);
}

function ensureFormHost() {
  const card = byId('leadCardContent')?.querySelector('.v4-lead-card-view');
  if (!card) return null;
  let host = byId('leadEditBox');
  if (host) return host;
  const actionPanel = card.querySelector('.v4-action-panel');
  const html = '<section id="leadEditBox" class="v4-subcard v4-lead-edit-section" hidden></section>';
  if (actionPanel) actionPanel.insertAdjacentHTML('beforebegin', html);
  else card.insertAdjacentHTML('afterbegin', html);
  return byId('leadEditBox');
}

function renderForm() {
  ensureButton();
  const host = ensureFormHost();
  if (!host) return;
  if (!editOpen) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }
  const lead = v4State.currentLead || {};
  host.hidden = false;
  host.innerHTML = `
    <div class="v4-subcard-head">
      <div>
        <h3>Редактировать заявку</h3>
        <p>Здесь можно исправить телефон, имя, услугу, город, бюджет, способ связи и текст обращения. Если заявка связана с клиентом, телефон и имя будут синхронизированы с клиентом.</p>
      </div>
      <span class="v4-muted">${lead.converted_client_id ? 'связана с клиентом' : 'клиент не связан'}</span>
    </div>
    <form id="leadEditForm" class="v4-lead-edit-form">
      <div class="v4-form-grid">
        <label>Имя / клиент<input id="leadEditName" value="${esc(lead.name || '')}" placeholder="Имя клиента или организация"></label>
        <label>Телефон<input id="leadEditPhone" value="${esc(lead.phone || '')}" placeholder="+7 ..."></label>
        <label>Услуга<input id="leadEditService" value="${esc(lead.service || '')}" placeholder="Например: баннер, вывеска, наклейки"></label>
        <label>Источник<input id="leadEditSource" value="${esc(lead.source || '')}" placeholder="Сайт, MAX, VK, звонок"></label>
        <label>Способ связи<input id="leadEditContact" value="${esc(lead.contact_preference || '')}" placeholder="MAX / телефон"></label>
        <label>Город<input id="leadEditCity" value="${esc(lead.city || '')}" placeholder="Борисоглебск"></label>
        <label>Бюджет<input id="leadEditBudget" type="number" step="1" value="${lead.budget ?? ''}" placeholder="0"></label>
        <label>Оценка / сумма<input id="leadEditEstimated" type="number" step="1" value="${lead.estimated_amount ?? ''}" placeholder="0"></label>
        <label>Качество<select id="leadEditQuality"><option ${lead.lead_quality === 'Не оценена' ? 'selected' : ''}>Не оценена</option><option ${lead.lead_quality === 'Холодная' ? 'selected' : ''}>Холодная</option><option ${lead.lead_quality === 'Средняя' ? 'selected' : ''}>Средняя</option><option ${lead.lead_quality === 'Тёплая' ? 'selected' : ''}>Тёплая</option><option ${lead.lead_quality === 'Горячая' ? 'selected' : ''}>Горячая</option></select></label>
        <label class="wide">Сообщение клиента<textarea id="leadEditMessage" rows="4">${esc(lead.message || '')}</textarea></label>
        <label class="wide">Страница / ссылка<input id="leadEditPageUrl" value="${esc(lead.page_url || '')}" placeholder="https://..."></label>
      </div>
      <div class="v4-form-actions">
        <button id="leadEditSaveBtn" class="v4-primary" type="submit" ${saveBusy ? 'disabled' : ''}>${saveBusy ? 'Сохраняю...' : 'Сохранить изменения'}</button>
        <button id="leadEditCancelBtn" type="button">Отмена</button>
      </div>
    </form>`;
}

function mergeLead(lead) {
  setState({
    currentLead: { ...(v4State.currentLead || {}), ...lead },
    leads: (v4State.leads || []).map((item) => item.id === lead.id ? { ...item, ...lead } : item)
  });
}
async function syncClient(lead, patch) {
  if (!lead.converted_client_id) return;
  const clientPatch = {};
  if ('name' in patch) clientPatch.name = patch.name;
  if ('phone' in patch) clientPatch.phone = patch.phone;
  if ('source' in patch) clientPatch.source = patch.source;
  if ('city' in patch && patch.city) clientPatch.address = patch.city;
  if (!Object.keys(clientPatch).length) return;
  await supabaseClient.from('leader_clients').update({ ...clientPatch, updated_at: new Date().toISOString() }).eq('id', lead.converted_client_id);
}
async function saveLead(event) {
  event.preventDefault();
  if (saveBusy) return;
  const lead = v4State.currentLead;
  if (!lead?.id) return;
  const patch = {
    name: value('leadEditName') || null,
    phone: value('leadEditPhone') || null,
    service: value('leadEditService') || null,
    source: value('leadEditSource') || null,
    contact_preference: value('leadEditContact') || null,
    city: value('leadEditCity') || null,
    budget: numberOrNull('leadEditBudget'),
    estimated_amount: numberOrNull('leadEditEstimated') || 0,
    lead_quality: value('leadEditQuality') || 'Не оценена',
    message: value('leadEditMessage') || null,
    page_url: value('leadEditPageUrl') || null
  };
  saveBusy = true;
  renderForm();
  try {
    setStatus('Сохраняю заявку...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', lead.id).select(LEAD_FIELDS).single(),
      12000,
      'Заявка не сохранилась за 12 секунд'
    );
    if (response.error) throw response.error;
    await syncClient(response.data, patch);
    mergeLead(response.data);
    editOpen = false;
    renderForm();
    setStatus('Заявка обновлена', 'good');
    toast('Заявка обновлена');
    document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: lead.id } }));
  } catch (error) {
    setStatus(`Ошибка сохранения заявки: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    saveBusy = false;
    renderForm();
  }
}

function bind() {
  document.addEventListener('leader-v4:lead-card-rendered', () => {
    editOpen = false;
    setTimeout(renderForm, 50);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#editLeadBtn')) {
      editOpen = !editOpen;
      renderForm();
      return;
    }
    if (event.target.closest('#leadEditCancelBtn')) {
      editOpen = false;
      renderForm();
    }
  });
  document.addEventListener('submit', async (event) => {
    if (event.target?.id === 'leadEditForm') await saveLead(event);
  });
}

bind();
setTimeout(renderForm, 100);
