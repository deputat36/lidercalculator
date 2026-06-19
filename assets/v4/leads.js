import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, setLeadFilters } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';
const CLOSED_STATUSES = ['Спам', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал'];
const ACTIVE_HIDDEN_STATUSES = new Set(CLOSED_STATUSES);
const ARCHIVE_STATUSES = new Set(CLOSED_STATUSES);
const STATUSES = ['Все', 'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено', 'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал', 'Спам'];
const QUICK_FILTERS = [
  ['active', 'Активные в работе'],
  ['no_phone', 'Без телефона'],
  ['no_next_contact', 'Без следующего контакта'],
  ['site', 'Заявки с сайта'],
  ['archive', 'Архив / завершённые']
];

let leadsLoadPromise = null;
let startupLoadTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function phoneHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk');
}

function isActiveLead(lead) {
  return !ACTIVE_HIDDEN_STATUSES.has(lead.status || 'Новая');
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
    if (status === 'active' && !isActiveLead(lead)) return false;
    if (status === 'archive' && !ARCHIVE_STATUSES.has(leadStatus)) return false;
    if (status === 'no_phone' && (String(lead.phone || '').trim() || !isActiveLead(lead))) return false;
    if (status === 'no_next_contact' && (lead.next_contact_at || !isActiveLead(lead))) return false;
    if (status === 'site' && !isSiteLead(lead)) return false;
    if (!['active', 'archive', 'no_phone', 'no_next_contact', 'site', 'Все'].includes(status) && leadStatus !== status) return false;
    if (source !== 'Все' && (lead.source || 'Не указан') !== source) return false;
    if (query && !leadHaystack(lead).includes(query)) return false;
    return true;
  });
}

function renderStats() {
  const leads = v4State.leads;
  const active = leads.filter(isActiveLead);
  const setText = (id, value) => { const element = byId(id); if (element) element.textContent = value; };
  setText('v4StatAllLeads', leads.length);
  setText('v4StatNewLeads', leads.filter((lead) => (lead.status || 'Новая') === 'Новая').length);
  setText('v4StatWorkLeads', leads.filter((lead) => (lead.status || '') === 'В работе').length);
  setText('v4StatWaitingLeads', leads.filter((lead) => ['Ждём ответ', 'КП отправлено', 'Уточнение деталей'].includes(lead.status || '')).length);
  setText('v4StatNoPhoneLeads', active.filter((lead) => !String(lead.phone || '').trim()).length);
  setText('v4StatNoNextContactLeads', active.filter((lead) => !lead.next_contact_at).length);
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
  const options = [...QUICK_FILTERS, ...STATUSES.map((status) => [status, status])];
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
  const noPhone = !String(lead.phone || '').trim();
  const noNextContact = !lead.next_contact_at && isActiveLead(lead);
  const siteLead = isSiteLead(lead);
  const hints = [
    siteLead ? '<span class="v4-lead-inline-hint is-site">Сайт</span>' : '',
    noPhone ? '<span class="v4-lead-inline-hint is-danger">Нет телефона</span>' : '',
    noNextContact ? '<span class="v4-lead-inline-hint is-warn">Нет следующего контакта</span>' : ''
  ].filter(Boolean).join('');
  return `
    <article class="v4-lead-card" data-id="${esc(lead.id)}">
      <div class="v4-lead-main">
        <div class="v4-lead-title-row"><h3>${esc(lead.name || 'Без имени')}</h3><span class="v4-lead-status ${statusClass(lead.status || 'Новая')}">${esc(lead.status || 'Новая')}</span></div>
        ${hints ? `<div class="v4-lead-inline-hints">${hints}</div>` : ''}
        <div class="v4-lead-meta"><span>${formatDate(lead.created_at)}</span><span>${esc(lead.source || 'Источник не указан')}</span><span>${esc(lead.service || 'Услуга не указана')}</span></div>
        <div class="v4-lead-details"><span><b>Телефон:</b> ${esc(lead.phone || '—')}</span><span><b>Город:</b> ${esc(lead.city || '—')}</span><span><b>Бюджет:</b> ${money(lead.budget || lead.estimated_amount)}</span></div>
        ${noPhone ? '<div class="v4-lead-warning-note">Нужно дозаполнить контакт: проверьте сообщение, страницу заявки или другой способ связи.</div>' : ''}
        ${lead.message ? `<p class="v4-lead-message">${esc(lead.message)}</p>` : ''}
      </div>
      <div class="v4-lead-actions">
        ${phone ? `<a href="${esc(phone)}">Позвонить</a>` : ''}
        <button type="button" data-action="open">Открыть</button>
        ${noPhone ? '<button type="button" data-action="clarify-contact">Уточнить контакт</button>' : ''}
        <button type="button" data-action="work">В работу</button>
      </div>
    </article>`;
}

function ensureLeadStatsExtras() {
  const stats = document.querySelector('.v4-lead-stats');
  if (!stats || document.getElementById('v4StatNoPhoneLeads')) return;
  stats.insertAdjacentHTML('beforeend', '<div><span>Без телефона</span><b id="v4StatNoPhoneLeads">0</b></div><div><span>Без контакта</span><b id="v4StatNoNextContactLeads">0</b></div>');
}

function ensureInlineStyles() {
  if (document.getElementById('leadsV4InlineHintsStyles')) return;
  const style = document.createElement('style');
  style.id = 'leadsV4InlineHintsStyles';
  style.textContent = `.v4-lead-inline-hints{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 0}.v4-lead-inline-hint{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:900;border:1px solid #cbd5e1;background:#f8fafc;color:#334155}.v4-lead-inline-hint.is-site{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}.v4-lead-inline-hint.is-danger{background:#fee2e2;border-color:#fecaca;color:#991b1b}.v4-lead-inline-hint.is-warn{background:#fef3c7;border-color:#fcd34d;color:#92400e}.v4-lead-warning-note{margin-top:8px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:12px;padding:8px;font-weight:800}`;
  document.head.appendChild(style);
}

export function renderLeads() {
  ensureLeadStatsExtras();
  ensureInlineStyles();
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
    list.innerHTML = `<div class="v4-empty">${esc(v4State.leadsError)}<div class="v4-form-actions" style="margin-top:12px"><button type="button" class="v4-primary" data-retry-leads>Повторить загрузку заявок</button></div></div>`;
    return;
  }
  if (!v4State.leadsLoaded) {
    list.innerHTML = '<div class="v4-empty">Заявки загрузятся автоматически через пару секунд. Также можно нажать «Обновить заявки».</div>';
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

async function doLoadLeads({ silent = false } = {}) {
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
      silent ? 45000 : 60000,
      silent ? 'Автоматическая загрузка заявок не успела ответить' : 'Заявки не загрузились за 60 секунд'
    );
    if (response.error) throw response.error;
    setState({ leads: response.data || [], leadsLoaded: true, leadsBusy: false, leadsError: null });
    renderLeads();
    if (!silent) setStatus(`CRM готова. Заявок: ${(response.data || []).length}`, 'good');
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    const safeMessage = silent
      ? 'Автоматическая загрузка заявок не успела ответить. Нажмите «Повторить загрузку заявок» или «Обновить заявки». CRM при этом открыта.'
      : `Заявки не загрузились: ${message}`;
    setState({ leadsBusy: false, leadsError: safeMessage, leadsLoaded: false });
    renderLeads();
    setStatus(silent ? 'CRM открыта. Заявки можно загрузить вручную.' : `Ошибка загрузки заявок: ${message}`, silent ? 'warn' : 'error');
    return [];
  } finally {
    leadsLoadPromise = null;
  }
}

export async function loadLeads({ silent = false, force = false } = {}) {
  if (!v4State.crmReady) {
    renderLeads();
    return [];
  }
  if (leadsLoadPromise && !force) return leadsLoadPromise;
  if (v4State.leadsBusy && leadsLoadPromise && !force) return leadsLoadPromise;
  leadsLoadPromise = doLoadLeads({ silent });
  return leadsLoadPromise;
}

async function updateLeadStatus(id, status) {
  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(LEAD_FIELDS)
      .single(),
    25000,
    'Статус заявки не обновился вовремя'
  );
  if (response.error) throw response.error;
  const updated = response.data;
  setState({ leads: v4State.leads.map((lead) => (lead.id === id ? { ...lead, ...updated } : lead)) });
  renderLeads();
}

function bindLeadEvents() {
  byId('reloadLeadsBtn')?.addEventListener('click', async () => {
    const result = await loadLeads({ force: true, silent: false });
    toast(result.length ? 'Заявки обновлены' : 'Заявки не загрузились');
  });
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
    if (event.target.closest('[data-retry-leads]')) {
      await loadLeads({ silent: false, force: true });
      return;
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.v4-lead-card');
    const id = card?.dataset.id;
    if (!id) return;
    if (button.dataset.action === 'open') {
      openLeadRoute(id);
      return;
    }
    if (button.dataset.action === 'work' || button.dataset.action === 'clarify-contact') {
      button.disabled = true;
      try {
        const nextStatus = button.dataset.action === 'clarify-contact' ? 'Уточнение деталей' : 'В работе';
        await updateLeadStatus(id, nextStatus);
        toast(button.dataset.action === 'clarify-contact' ? 'Заявка отправлена на уточнение контакта' : 'Заявка переведена в работу');
      } catch (error) {
        toast(friendlyError(error));
      } finally {
        button.disabled = false;
      }
    }
  });
}

function scheduleStartupLeadLoad() {
  window.clearTimeout(startupLoadTimer);
  startupLoadTimer = window.setTimeout(() => {
    if (v4State.crmReady && !v4State.leadsLoaded && !v4State.leadsBusy) {
      loadLeads({ silent: true });
    }
  }, 1800);
}

export function bootLeads() {
  bindLeadEvents();
  renderLeads();
  document.addEventListener('leader-v4:crm-ready', scheduleStartupLeadLoad);
  if (v4State.crmReady && !v4State.leadsLoaded && !v4State.leadsBusy) scheduleStartupLeadLoad();
}

document.addEventListener('DOMContentLoaded', bootLeads);
