import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';
const CLOSED_STATUSES = new Set(['Спам', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал']);
let renderTimer = null;
let busyId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function nextDate(kind) {
  const date = new Date();
  if (kind === 'plus1h') date.setHours(date.getHours() + 1, 0, 0, 0);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  }
  if (kind === 'plus3d') {
    date.setDate(date.getDate() + 3);
    date.setHours(10, 0, 0, 0);
  }
  return date;
}

function dueLeads() {
  const todayEnd = endOfToday();
  return (v4State.leads || [])
    .filter((lead) => {
      const status = lead.status || 'Новая';
      if (CLOSED_STATUSES.has(status)) return false;
      if (!lead.next_contact_at) return false;
      const date = new Date(lead.next_contact_at);
      if (Number.isNaN(date.getTime())) return false;
      return date <= todayEnd;
    })
    .sort((a, b) => new Date(a.next_contact_at) - new Date(b.next_contact_at));
}

function missingNextContactLeads() {
  return (v4State.leads || [])
    .filter((lead) => {
      const status = lead.status || 'Новая';
      if (CLOSED_STATUSES.has(status)) return false;
      if (lead.next_contact_at) return false;
      return ['Новая', 'В работе', 'Уточнение деталей', 'КП отправлено', 'Ждём ответ', 'Нужно пересчитать'].includes(status);
    })
    .slice(0, 5);
}

function renderDueItem(lead) {
  const dueDate = new Date(lead.next_contact_at);
  const overdue = dueDate < startOfToday();
  const disabled = busyId === lead.id ? 'disabled' : '';
  return `
    <article class="v4-followup-item ${overdue ? 'is-overdue' : ''}">
      <div>
        <div class="v4-followup-title">
          <h4>${esc(lead.name || 'Без имени')}</h4>
          <span>${overdue ? 'Просрочено' : 'Сегодня'}</span>
        </div>
        <div class="v4-followup-meta">
          <span><b>Контакт:</b> ${formatDate(lead.next_contact_at)}</span>
          <span><b>Телефон:</b> ${esc(lead.phone || '—')}</span>
          <span><b>Статус:</b> ${esc(lead.status || 'Новая')}</span>
          <span><b>Услуга:</b> ${esc(lead.service || '—')}</span>
          <span><b>Бюджет:</b> ${money(lead.budget || lead.estimated_amount)}</span>
        </div>
      </div>
      <div class="v4-followup-actions">
        <button type="button" data-followup-open="${esc(lead.id)}">Открыть</button>
        <button type="button" data-followup-postpone="plus1h" data-followup-id="${esc(lead.id)}" ${disabled}>+1 час</button>
        <button type="button" data-followup-postpone="tomorrow" data-followup-id="${esc(lead.id)}" ${disabled}>Завтра 10:00</button>
      </div>
    </article>
  `;
}

function renderMissingItem(lead) {
  return `
    <button type="button" class="v4-followup-missing" data-followup-open="${esc(lead.id)}">
      <b>${esc(lead.name || 'Без имени')}</b>
      <span>${esc(lead.status || 'Новая')} · ${esc(lead.service || 'Услуга не указана')}</span>
    </button>
  `;
}

function ensureHost() {
  const section = byId('leadsSection');
  if (!section) return null;
  let host = byId('followupsBox');
  if (host) return host;
  const stats = section.querySelector('.v4-lead-stats');
  const html = '<section id="followupsBox" class="v4-followups-box"></section>';
  if (stats) stats.insertAdjacentHTML('beforebegin', html);
  else section.insertAdjacentHTML('afterbegin', html);
  return byId('followupsBox');
}

function render() {
  const host = ensureHost();
  if (!host) return;
  if (!v4State.crmReady) {
    host.innerHTML = '';
    return;
  }
  if (v4State.leadsBusy) {
    host.innerHTML = '<div class="v4-followups-box-inner"><h3>Кому связаться сегодня</h3><div class="v4-empty">Заявки загружаются...</div></div>';
    return;
  }
  const due = dueLeads();
  const missing = missingNextContactLeads();
  const overdueCount = due.filter((lead) => new Date(lead.next_contact_at) < startOfToday()).length;
  host.innerHTML = `
    <div class="v4-followups-box-inner">
      <div class="v4-subcard-head">
        <div>
          <h3>Кому связаться сегодня</h3>
          <p>Здесь заявки с сегодняшним или просроченным следующим контактом. Не даём клиентам потеряться.</p>
        </div>
        <span class="v4-muted">Сегодня/просрочено: ${due.length}${overdueCount ? ` · просрочено: ${overdueCount}` : ''}</span>
      </div>
      ${due.length ? `<div class="v4-followup-list">${due.map(renderDueItem).join('')}</div>` : '<div class="v4-empty">На сегодня контактов нет. Можно спокойно обработать новые заявки.</div>'}
      ${missing.length ? `<div class="v4-followup-missing-list"><h4>Без даты следующего контакта</h4><div>${missing.map(renderMissingItem).join('')}</div></div>` : ''}
    </div>
  `;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 60);
}

async function postponeLead(id, kind) {
  const date = nextDate(kind);
  busyId = id;
  render();
  try {
    setStatus('Переношу следующий контакт...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .update({ next_contact_at: date.toISOString(), status: 'Ждём ответ', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(LEAD_FIELDS)
        .single(),
      12000,
      'Следующий контакт не обновился за 12 секунд'
    );
    if (response.error) throw response.error;
    const updated = response.data;
    setState({ leads: (v4State.leads || []).map((lead) => (lead.id === id ? { ...lead, ...updated } : lead)) });
    toast('Следующий контакт перенесён');
    setStatus('Следующий контакт перенесён', 'good');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка переноса контакта: ${friendlyError(error)}`, 'error');
  } finally {
    busyId = null;
    render();
  }
}

function bindEvents() {
  document.addEventListener('click', async (event) => {
    const openButton = event.target.closest('[data-followup-open]');
    if (openButton) {
      openLeadRoute(openButton.dataset.followupOpen);
      return;
    }
    const postponeButton = event.target.closest('[data-followup-postpone]');
    if (postponeButton) {
      await postponeLead(postponeButton.dataset.followupId, postponeButton.dataset.followupPostpone);
    }
  });
  document.addEventListener('leader-v4:crm-ready', scheduleRender);
  subscribeState(scheduleRender);
}

bindEvents();
scheduleRender();
