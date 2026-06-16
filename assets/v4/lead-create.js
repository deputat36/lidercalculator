import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';

let formReady = false;
let busy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function parseMoney(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function defaultNextContactValue() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function leadPayload() {
  const name = byId('manualLeadName')?.value?.trim() || '';
  const phone = byId('manualLeadPhone')?.value?.trim() || '';
  const source = byId('manualLeadSource')?.value?.trim() || 'Вручную';
  const service = byId('manualLeadService')?.value?.trim() || '';
  const city = byId('manualLeadCity')?.value?.trim() || '';
  const contactPreference = byId('manualLeadContact')?.value?.trim() || '';
  const budget = parseMoney(byId('manualLeadBudget')?.value || '');
  const leadQuality = byId('manualLeadQuality')?.value || 'Не оценена';
  const nextContactAt = localDateTimeToIso(byId('manualLeadNextContact')?.value || '');
  const message = byId('manualLeadMessage')?.value?.trim() || '';

  if (!name && !phone) throw new Error('Укажите имя или телефон клиента');
  if (!phone && !message) throw new Error('Без телефона добавьте хотя бы комментарий, откуда заявка и что нужно клиенту');

  return {
    name: name || 'Без имени',
    phone,
    source,
    service,
    city,
    contact_preference: contactPreference,
    budget,
    estimated_amount: budget || 0,
    lead_quality: leadQuality,
    next_contact_at: nextContactAt,
    message,
    status: 'Новая',
    page_url: 'CRM v4 / ручное создание',
    payload: {
      created_from: 'crm_v4_manual',
      created_by: v4State.user?.id || null,
      created_by_email: v4State.user?.email || null,
      created_at: new Date().toISOString()
    }
  };
}

function resetForm() {
  ['manualLeadName', 'manualLeadPhone', 'manualLeadService', 'manualLeadCity', 'manualLeadBudget', 'manualLeadMessage'].forEach((id) => {
    const element = byId(id);
    if (element) element.value = '';
  });
  if (byId('manualLeadSource')) byId('manualLeadSource').value = 'Вручную';
  if (byId('manualLeadContact')) byId('manualLeadContact').value = 'Телефон';
  if (byId('manualLeadQuality')) byId('manualLeadQuality').value = 'Не оценена';
  if (byId('manualLeadNextContact')) byId('manualLeadNextContact').value = defaultNextContactValue();
}

function renderForm() {
  const section = byId('leadsSection');
  if (!section || byId('manualLeadBox')) return;
  const html = `
    <details id="manualLeadBox" class="v4-manual-lead-box">
      <summary>Добавить заявку вручную</summary>
      <form id="manualLeadForm" class="v4-manual-lead-form">
        <div class="v4-form-grid">
          <label>Имя клиента
            <input id="manualLeadName" placeholder="Например: Иван">
          </label>
          <label>Телефон
            <input id="manualLeadPhone" inputmode="tel" placeholder="+7 900 000-00-00">
          </label>
          <label>Источник
            <select id="manualLeadSource">
              <option>Вручную</option>
              <option>Телефон</option>
              <option>WhatsApp</option>
              <option>ВКонтакте</option>
              <option>Офис</option>
              <option>Повторный клиент</option>
              <option>Рекомендация</option>
            </select>
          </label>
          <label>Услуга
            <input id="manualLeadService" placeholder="Баннер, вывеска, плёнка, дизайн...">
          </label>
          <label>Город
            <input id="manualLeadCity" value="Борисоглебск">
          </label>
          <label>Как связаться
            <select id="manualLeadContact">
              <option>Телефон</option>
              <option>WhatsApp</option>
              <option>Сообщение ВК</option>
              <option>Любой способ</option>
            </select>
          </label>
          <label>Ориентир по бюджету
            <input id="manualLeadBudget" inputmode="decimal" placeholder="Например: 15000">
          </label>
          <label>Качество заявки
            <select id="manualLeadQuality">
              <option>Не оценена</option>
              <option>Горячая</option>
              <option>Тёплая</option>
              <option>Холодная</option>
            </select>
          </label>
          <label>Следующий контакт
            <input id="manualLeadNextContact" type="datetime-local" value="${esc(defaultNextContactValue())}">
          </label>
        </div>
        <label class="v4-manual-lead-comment">Комментарий / что нужно клиенту
          <textarea id="manualLeadMessage" rows="3" placeholder="Например: нужен баннер 3×2 м, уточнить материал и сроки"></textarea>
        </label>
        <div class="v4-form-actions">
          <button id="createManualLeadBtn" type="submit" class="v4-primary">Создать заявку</button>
          <button id="resetManualLeadBtn" type="button">Очистить</button>
        </div>
      </form>
    </details>
  `;
  const stats = section.querySelector('.v4-lead-stats');
  if (stats) stats.insertAdjacentHTML('beforebegin', html);
  else section.insertAdjacentHTML('afterbegin', html);
}

async function createLead() {
  if (busy) return;
  busy = true;
  const button = byId('createManualLeadBtn');
  if (button) button.disabled = true;
  try {
    const payload = leadPayload();
    setStatus('Создаю заявку вручную...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_leads').insert(payload).select(LEAD_FIELDS).single(),
      14000,
      'Заявка не создалась за 14 секунд'
    );
    if (response.error) throw response.error;
    const created = response.data;
    setState({ leads: [created, ...(v4State.leads || [])], leadsLoaded: true });
    resetForm();
    setStatus('Заявка создана', 'good');
    toast('Заявка создана');
    openLeadRoute(created.id);
  } catch (error) {
    const message = friendlyError(error);
    setStatus(`Ошибка создания заявки: ${message}`, 'error');
    toast(message);
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

function bindForm() {
  if (formReady) return;
  formReady = true;
  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'manualLeadForm') return;
    event.preventDefault();
    await createLead();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.id === 'resetManualLeadBtn') resetForm();
  });
}

function bootManualLead() {
  renderForm();
  bindForm();
}

document.addEventListener('DOMContentLoaded', bootManualLead);
document.addEventListener('leader-v4:crm-ready', bootManualLead);
