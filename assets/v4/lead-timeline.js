import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const LEAD_EVENT_FIELDS = 'id,lead_id,event_type,old_status,new_status,body,created_by,created_by_email,created_at';
const OFFER_EVENT_FIELDS = 'id,offer_id,lead_id,calculation_id,event_type,old_status,new_status,comment,created_by,created_by_email,created_at';

let currentLeadId = null;
let leadEvents = [];
let offerEvents = [];
let busy = false;
let errorText = '';
let saveBusy = false;
let renderTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function eventIcon(type, source) {
  const value = String(type || '').toLowerCase();
  if (source === 'offer') return 'КП';
  if (value.includes('звон')) return '☎';
  if (value.includes('max')) return 'MAX';
  if (value.includes('статус')) return '↻';
  if (value.includes('контакт')) return '⏰';
  if (value.includes('проблем')) return '!';
  return '●';
}

function eventTitle(event) {
  if (event.source === 'offer') {
    if (event.new_status) return `КП: ${event.new_status}`;
    return event.event_type || 'Событие КП';
  }
  if (event.new_status && event.old_status) return `Статус: ${event.old_status} → ${event.new_status}`;
  if (event.new_status) return `Статус: ${event.new_status}`;
  return event.event_type || 'Заметка';
}

function eventBody(event) {
  return event.body || event.comment || '';
}

function normalizeLeadEvent(event) {
  return { ...event, source: 'lead', sortDate: event.created_at || '' };
}

function normalizeOfferEvent(event) {
  return { ...event, source: 'offer', sortDate: event.created_at || '', body: event.comment || '' };
}

function mergedEvents() {
  return [
    ...leadEvents.map(normalizeLeadEvent),
    ...offerEvents.map(normalizeOfferEvent)
  ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));
}

function ensureHost() {
  const card = byId('leadCardContent')?.querySelector('.v4-lead-card-view');
  if (!card) return null;
  let host = byId('leadTimelineBox');
  if (host) return host;
  const html = '<section id="leadTimelineBox" class="v4-subcard v4-lead-timeline-section"></section>';
  const actionPanel = card.querySelector('.v4-action-panel');
  if (actionPanel) actionPanel.insertAdjacentHTML('afterend', html);
  else card.insertAdjacentHTML('afterbegin', html);
  return byId('leadTimelineBox');
}

function renderEvent(event) {
  const body = eventBody(event);
  const email = event.created_by_email || 'CRM';
  const sourceClass = event.source === 'offer' ? ' is-offer' : '';
  return `
    <article class="v4-timeline-item${sourceClass}">
      <div class="v4-timeline-icon">${esc(eventIcon(event.event_type, event.source))}</div>
      <div class="v4-timeline-content">
        <div class="v4-timeline-head">
          <b>${esc(eventTitle(event))}</b>
          <span>${formatDateTime(event.created_at)}</span>
        </div>
        ${body ? `<p>${esc(body)}</p>` : ''}
        <div class="v4-timeline-author">${esc(email)}</div>
      </div>
    </article>
  `;
}

function render() {
  const host = ensureHost();
  if (!host) return;
  const lead = v4State.currentLead;
  if (!lead?.id) {
    host.innerHTML = '';
    return;
  }
  const events = mergedEvents();
  host.innerHTML = `
    <div class="v4-subcard-head">
      <div>
        <h3>История и комментарии</h3>
        <p>Фиксируйте звонки, сообщения в MAX, договорённости, причины пауз и важные изменения по заявке.</p>
      </div>
      <span class="v4-muted">Событий: ${events.length}</span>
    </div>

    <form id="leadTimelineForm" class="v4-timeline-form">
      <div class="v4-form-grid">
        <label>Тип записи
          <select id="leadTimelineType">
            <option>Комментарий</option>
            <option>Звонок</option>
            <option>MAX</option>
            <option>Статус</option>
            <option>Следующий контакт</option>
            <option>Проблема</option>
          </select>
        </label>
        <label>Быстрые заготовки
          <select id="leadTimelineTemplate">
            <option value="">Выбрать шаблон</option>
            <option>Позвонил, клиент не ответил. Нужно повторить позже.</option>
            <option>Связался в MAX, клиент уточняет детали.</option>
            <option>Клиент попросил отправить коммерческое предложение.</option>
            <option>Клиент думает, нужно вернуться к нему позже.</option>
            <option>Клиенту дорого, нужно предложить альтернативный вариант.</option>
            <option>Ждём от клиента макет / размеры / материалы.</option>
          </select>
        </label>
      </div>
      <label class="v4-timeline-body-label">Комментарий менеджера
        <textarea id="leadTimelineBody" rows="3" placeholder="Например: обсудили баннер 3×2, клиент ждёт КП в MAX, перезвонить завтра после 10:00"></textarea>
      </label>
      <div class="v4-form-actions">
        <button id="leadTimelineSaveBtn" type="submit" class="v4-primary" ${saveBusy ? 'disabled' : ''}>Добавить запись</button>
        <button id="leadTimelineReloadBtn" type="button" ${busy ? 'disabled' : ''}>Обновить историю</button>
      </div>
    </form>

    ${errorText ? `<div class="v4-empty is-error">${esc(errorText)}</div>` : ''}
    ${busy ? '<div class="v4-empty">Загружаю историю...</div>' : events.length ? `<div class="v4-timeline-list">${events.map(renderEvent).join('')}</div>` : '<div class="v4-empty">История пока пустая. Добавьте первую заметку после контакта с клиентом.</div>'}
  `;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 50);
}

export async function loadLeadTimeline(leadId = v4State.currentLead?.id || v4State.route.leadId) {
  if (!leadId || !v4State.crmReady) {
    currentLeadId = null;
    leadEvents = [];
    offerEvents = [];
    errorText = '';
    scheduleRender();
    return;
  }
  currentLeadId = leadId;
  busy = true;
  errorText = '';
  scheduleRender();
  try {
    const [leadResponse, offerResponse] = await Promise.all([
      timeout(
        supabaseClient
          .from('leader_lead_events')
          .select(LEAD_EVENT_FIELDS)
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(80),
        12000,
        'История заявки не загрузилась за 12 секунд'
      ),
      timeout(
        supabaseClient
          .from('leader_commercial_offer_events')
          .select(OFFER_EVENT_FIELDS)
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(40),
        12000,
        'История КП не загрузилась за 12 секунд'
      )
    ]);
    if (leadResponse.error) throw leadResponse.error;
    if (offerResponse.error) throw offerResponse.error;
    if (currentLeadId !== leadId) return;
    leadEvents = leadResponse.data || [];
    offerEvents = offerResponse.data || [];
    busy = false;
    errorText = '';
    render();
  } catch (error) {
    if (currentLeadId !== leadId) return;
    leadEvents = [];
    offerEvents = [];
    busy = false;
    errorText = friendlyError(error);
    render();
  }
}

export async function addLeadTimelineEvent({ leadId, eventType = 'Комментарий', body = '', oldStatus = null, newStatus = null } = {}) {
  const targetLeadId = leadId || v4State.currentLead?.id || v4State.route.leadId;
  const cleanBody = String(body || '').trim();
  if (!targetLeadId) throw new Error('Заявка не выбрана');
  if (!cleanBody && !newStatus) throw new Error('Заполните комментарий');
  const payload = {
    lead_id: targetLeadId,
    event_type: eventType,
    old_status: oldStatus,
    new_status: newStatus,
    body: cleanBody,
    created_by: v4State.user?.id || null,
    created_by_email: v4State.user?.email || null
  };
  const response = await timeout(
    supabaseClient.from('leader_lead_events').insert(payload).select(LEAD_EVENT_FIELDS).single(),
    12000,
    'Запись истории не сохранилась за 12 секунд'
  );
  if (response.error) throw response.error;
  leadEvents = [response.data, ...leadEvents];
  render();
  return response.data;
}

async function saveForm() {
  if (saveBusy) return;
  const type = byId('leadTimelineType')?.value || 'Комментарий';
  const body = byId('leadTimelineBody')?.value?.trim() || '';
  if (!body) {
    toast('Напишите комментарий');
    return;
  }
  saveBusy = true;
  render();
  try {
    setStatus('Сохраняю комментарий...', 'warn');
    await addLeadTimelineEvent({ eventType: type, body });
    const textarea = byId('leadTimelineBody');
    if (textarea) textarea.value = '';
    setStatus('Комментарий добавлен в историю', 'good');
    toast('Комментарий добавлен');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка комментария: ${friendlyError(error)}`, 'error');
  } finally {
    saveBusy = false;
    render();
  }
}

function bindEvents() {
  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'leadTimelineForm') return;
    event.preventDefault();
    await saveForm();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.id === 'leadTimelineReloadBtn') loadLeadTimeline();
  });
  document.addEventListener('change', (event) => {
    if (event.target?.id !== 'leadTimelineTemplate') return;
    const value = event.target.value || '';
    const textarea = byId('leadTimelineBody');
    if (textarea && value) {
      textarea.value = textarea.value ? `${textarea.value}\n${value}` : value;
      textarea.focus();
    }
    event.target.value = '';
  });
  document.addEventListener('leader-v4:lead-card-rendered', (event) => {
    const leadId = event.detail?.leadId || v4State.currentLead?.id || v4State.route.leadId;
    scheduleRender();
    loadLeadTimeline(leadId);
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    const leadId = event.detail?.leadId || null;
    if (leadId) loadLeadTimeline(leadId);
    else {
      currentLeadId = null;
      leadEvents = [];
      offerEvents = [];
      errorText = '';
      scheduleRender();
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadLeadTimeline(v4State.route.leadId);
  });
  subscribeState((state) => {
    if (state.currentLead?.id && state.currentLead.id !== currentLeadId && !busy) {
      loadLeadTimeline(state.currentLead.id);
    } else {
      scheduleRender();
    }
  });
}

bindEvents();
scheduleRender();
window.leaderAddLeadEvent = addLeadTimelineEvent;
