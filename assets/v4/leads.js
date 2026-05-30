import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, setLeadFilters } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';
const ACTIVE_HIDDEN_STATUSES = new Set(['Спам']);
const ARCHIVE_STATUSES = new Set(['Спам']);
const STATUSES = ['Все', 'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено', 'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал', 'Спам'];

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

function phoneHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

function leadHaystack(lead) {
  return [lead.name, lead.phone, lead.source, lead.service, lead.message, lead.city, lead.status].join(' ').toLowerCase();
}

function uniqueSources(leads) {
  const sources = new Set(['Все']);
  leads.forEach((lead) => sources.add(lead.source || 'Не указан'));
  return [...sources];
}

function filteredLeads() {
  const { status, source, search } = v4State.leadFilters;
  const query = String(search || '').toLowerCase().trim();
  return v4State.leads.filter((lead) => {
    const leadStatus = lead.status || 'Новая';
    if (status === 'active' && ACTIVE_HIDDEN_STATUSES.has(leadStatus)) return false;
    if (status === 'archive' && !ARCHIVE_STATUSES.has(leadStatus)) return false;
    if (status !== 'active' && status !== 'archive' && status !== 'Все' && leadStatus !== status) return false;
    if (source !== 'Все' && (lead.source || 'Не указан') !== source) return false;
    if (query && !leadHaystack(lead).includes(query)) return false;
    return true;
  });
}

function renderStats() {
  const leads = v4State.leads;
  const setText = (id, value) => { const element = byId(id); if (element) element.textContent = value; };
  setText('v4StatAllLeads', leads.length);
  setText('v4StatNewLeads', leads.filter((lead) => (lead.status || 'Новая') === 'Новая').length);
  setText('v4StatWorkLeads', leads.filter((lead) => (lead.status || '') === 'В работе').length);
  setText('v4StatWaitingLeads', leads.filter((lead) => ['Ждём ответ', 'КП отправлено', 'Уточнение деталей'].includes(lead.status || '')).length);
}

function renderSourceOptions() {
  const select = byId('leadSourceFilter');
  if (!select) return;
  const current = select.value || v4State.leadFilters.source || 'Все';
  const sources = uniqueSources(v4State.leads);
  select.innerHTML = sources.map((source) => `<option ${source === current ? 'selected' : ''}>${esc(source)}</option>`).join('');
  if (!sources.includes(current)) {
    select.value = 'Все';
    setLeadFilters({ source: 'Все' });
  }
}

function renderStatusOptions() {
  const select = byId('leadStatusFilter');
  if (!select) return;
  const current = select.value || v4State.leadFilters.status || 'active';
  const options = [
    ['active', 'Активные'],
    ['archive', 'Архив / спам'],
    ...STATUSES.map((status) => [status, status])
  ];
  select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`).join('');
  select.value = current;
}

function statusClass(status) {
  if (['Создан заказ', 'Согласовано'].includes(status)) return 'is-good';
  if (['Ждём ответ', 'КП отправлено', 'Уточнение деталей', 'Нужно пересчитать'].includes(status)) return 'is-warn';
  if (['Отказ', 'Дорого', 'Передумал', 'Не отвечает', 'Спам'].includes(status)) return 'is-error';
  return '';
}

function renderLeadCard(lead) {
  const phone = phoneHref(lead.phone);
  return `
    <article class="v4-lead-card" data-id="${esc(lead.id)}">
      <div class="v4-lead-main">
        <div class="v4-lead-title-row">
          <h3>${esc(lead.name || 'Без имени')}</h3>
          <span class="v4-lead-status ${statusClass(lead.status || 'Новая')}">${esc(lead.status || 'Новая')}</span>
        </div>
        <div class="v4-lead-meta">
          <span>${formatDate(lead.created_at)}</span>
          <span>${esc(lead.source || 'Источник не указан')}</span>
          <span>${esc(lead.service || 'Услуга не указана')}</span>
        </div>
        <div class="v4-lead-details">
          <span><b>Телефон:</b> ${esc(lead.phone || '—')}</span>
          <span><b>Город:</b> ${esc(lead.city || '—')}</span>
          <span><b>Бюджет:</b> ${money(lead.budget || lead.estimated_amount)}</span>
        </div>
        ${lead.message ? `<p class="v4-lead-message">${esc(lead.message)}</p>` : ''}
      </div>
      <div class="v4-lead-actions">
        ${phone ? `<a href="${esc(phone)}">Позвонить</a>` : ''}
        <button type="button" data-action="open">Открыть</button>
        <button type="button" data-action="work">В работу</button>
      </div>
    </article>
  `;
}

export function renderLeads() {
  renderStats();
  renderStatusOptions();
  renderSourceOptions();
  const list = byId('leadsList');
  const counter = byId('leadsCounter');
  if (!list) return;
  const leads = filteredLeads();
  if (counter) counter.textContent = v4State.leadsLoaded ? `Показано: ${leads.length} из ${v4State.leads.length}` : 'Заявки ещё не загружены';
  if (v4State.leadsBusy) {
    list.innerHTML = '<div class="v4-empty">Загружаю заявки...</div>';
    return;
  }
  if (v4State.leadsError) {
    list.innerHTML = `<div class="v4-empty is-error">${esc(v4State.leadsError)}</div>`;
    return;
  }
  if (!v4State.leadsLoaded) {
    list.innerHTML = '<div class="v4-empty">После входа заявки загрузятся автоматически.</div>';
    return;
  }
  if (!v4State.leads.length) {
    list.innerHTML = '<div class="v4-empty">В базе пока нет заявок.</div>';
    return;
  }
  if (!leads.length) {
    list.innerHTML = '<div class="v4-empty">Заявки загружены, но по выбранному фильтру ничего нет.</div>';
    return;
  }
  list.innerHTML = leads.map(renderLeadCard).join('');
}

export async function loadLeads({ silent = false } = {}) {
  if (!v4State.crmReady) {
    renderLeads();
    return [];
  }
  setState({ leadsBusy: true, leadsError: null });
  renderLeads();
  try {
    if (!silent) setStatus('Загружаю заявки...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .select(LEAD_FIELDS)
        .order('created_at', { ascending: false })
        .limit(50),
      14000,
      'Заявки не загрузились за 14 секунд'
    );
    if (response.error) throw response.error;
    setState({ leads: response.data || [], leadsLoaded: true, leadsBusy: false, leadsError: null });
    renderLeads();
    if (!silent) setStatus(`CRM готова. Заявок: ${(response.data || []).length}`, 'good');
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    setState({ leadsBusy: false, leadsError: message, leadsLoaded: true });
    renderLeads();
    setStatus(`Ошибка загрузки заявок: ${message}`, 'error');
    return [];
  }
}

async function updateLeadStatus(id, status) {
  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(LEAD_FIELDS)
      .single(),
    12000,
    'Статус заявки не обновился вовремя'
  );
  if (response.error) throw response.error;
  const updated = response.data;
  setState({ leads: v4State.leads.map((lead) => (lead.id === id ? { ...lead, ...updated } : lead)) });
  renderLeads();
}

function bindLeadEvents() {
  byId('reloadLeadsBtn')?.addEventListener('click', () => loadLeads().then(() => toast('Заявки обновлены')));
  byId('leadStatusFilter')?.addEventListener('change', (event) => {
    setLeadFilters({ status: event.target.value });
    renderLeads();
  });
  byId('leadSourceFilter')?.addEventListener('change', (event) => {
    setLeadFilters({ source: event.target.value });
    renderLeads();
  });
  byId('leadSearch')?.addEventListener('input', (event) => {
    setLeadFilters({ search: event.target.value });
    renderLeads();
  });
  byId('leadsList')?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.v4-lead-card');
    const id = card?.dataset.id;
    if (!id) return;
    if (button.dataset.action === 'open') {
      openLeadRoute(id);
      return;
    }
    if (button.dataset.action === 'work') {
      button.disabled = true;
      try {
        await updateLeadStatus(id, 'В работе');
        toast('Заявка переведена в работу');
      } catch (error) {
        toast(friendlyError(error));
      } finally {
        button.disabled = false;
      }
    }
  });
}

export function bootLeads() {
  bindLeadEvents();
  renderLeads();
  document.addEventListener('leader-v4:crm-ready', () => loadLeads({ silent: true }));
  if (v4State.crmReady && !v4State.leadsLoaded && !v4State.leadsBusy) {
    loadLeads({ silent: true });
  }
}

document.addEventListener('DOMContentLoaded', bootLeads);
