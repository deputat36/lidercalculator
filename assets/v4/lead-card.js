import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { clearLeadUrl } from './router.js';
import './offers-loader.js';

const FULL_LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,utm_source,utm_medium,utm_campaign,utm_content,utm_term,assigned_to,converted_order_id,converted_client_id,last_contact_at,next_contact_at,converted_at,reject_reason,lead_quality,estimated_amount';

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

function payloadRows(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return Object.entries(payload)
    .slice(0, 12)
    .map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(typeof value === 'object' ? JSON.stringify(value) : value)}</dd></div>`)
    .join('');
}

function renderLeadDetails(lead) {
  const phone = phoneHref(lead.phone);
  const payloadHtml = payloadRows(lead.payload);
  return `
    <div class="v4-lead-card-view">
      <div class="v4-card-view-head">
        <div>
          <p class="v4-kicker">Карточка заявки</p>
          <h2>${esc(lead.name || 'Без имени')}</h2>
          <p>${esc(lead.service || 'Услуга не указана')}</p>
        </div>
        <div class="v4-card-view-actions">
          <button id="backToLeadsBtn" type="button">Назад к списку</button>
          <button id="refreshLeadBtn" type="button" class="v4-primary">Обновить</button>
          ${phone ? `<a href="${esc(phone)}">Позвонить</a>` : ''}
        </div>
      </div>

      <div class="v4-detail-grid">
        <div><dt>Статус</dt><dd>${esc(lead.status || 'Новая')}</dd></div>
        <div><dt>Телефон</dt><dd>${esc(lead.phone || '—')}</dd></div>
        <div><dt>Источник</dt><dd>${esc(lead.source || '—')}</dd></div>
        <div><dt>Город</dt><dd>${esc(lead.city || '—')}</dd></div>
        <div><dt>Бюджет</dt><dd>${money(lead.budget || lead.estimated_amount)}</dd></div>
        <div><dt>Качество</dt><dd>${esc(lead.lead_quality || '—')}</dd></div>
        <div><dt>Дата заявки</dt><dd>${formatDate(lead.created_at)}</dd></div>
        <div><dt>Следующий контакт</dt><dd>${formatDate(lead.next_contact_at)}</dd></div>
      </div>

      <section class="v4-subcard">
        <h3>Сообщение клиента</h3>
        <p>${esc(lead.message || 'Сообщение не заполнено.')}</p>
      </section>

      <section class="v4-subcard v4-needs-section">
        <div class="v4-subcard-head">
          <div>
            <h3>Потребности клиента</h3>
            <p>В одной заявке можно зафиксировать несколько задач: баннер, вывеска, плёнка, полиграфия, монтаж и другое.</p>
          </div>
          <span id="needsCounter" class="v4-muted">Потребностей: 0</span>
        </div>
        <div id="needsList" class="v4-needs-list">
          <div class="v4-empty">Потребности пока не загружены.</div>
        </div>
        <div class="v4-need-form-card">
          <h4>Добавить потребность</h4>
          <div id="needFormBox"></div>
        </div>
      </section>

      <section id="calculationsBox" class="v4-calculations-host">
        <div class="v4-empty">Расчёты загрузятся после открытия карточки.</div>
      </section>

      <section id="offersBox" class="v4-offers-host">
        <div class="v4-empty">Коммерческие предложения загрузятся после открытия карточки.</div>
      </section>

      <section class="v4-subcard">
        <h3>Ссылки и источник</h3>
        <dl class="v4-detail-grid">
          <div><dt>Страница</dt><dd>${lead.page_url ? `<a href="${esc(lead.page_url)}" target="_blank" rel="noopener">Открыть</a>` : '—'}</dd></div>
          <div><dt>UTM source</dt><dd>${esc(lead.utm_source || '—')}</dd></div>
          <div><dt>UTM medium</dt><dd>${esc(lead.utm_medium || '—')}</dd></div>
          <div><dt>UTM campaign</dt><dd>${esc(lead.utm_campaign || '—')}</dd></div>
        </dl>
      </section>

      <section class="v4-subcard">
        <h3>Следующий этап</h3>
        <p>После проверки коммерческих предложений будет добавлено создание заказа из согласованного расчёта.</p>
      </section>

      ${payloadHtml ? `<section class="v4-subcard"><h3>Технические данные формы</h3><dl class="v4-detail-grid">${payloadHtml}</dl></section>` : ''}
    </div>
  `;
}

export function showLeadCard() {
  const listSection = byId('leadsSection');
  const cardSection = byId('leadCardSection');
  if (listSection) listSection.classList.add('hidden');
  if (cardSection) cardSection.classList.remove('hidden');
}

export function showLeadsList() {
  const listSection = byId('leadsSection');
  const cardSection = byId('leadCardSection');
  if (listSection) listSection.classList.remove('hidden');
  if (cardSection) cardSection.classList.add('hidden');
}

export function renderCurrentLead() {
  const box = byId('leadCardContent');
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '<div class="v4-empty">Выберите заявку из списка.</div>';
    showLeadsList();
    return;
  }
  showLeadCard();
  if (v4State.currentLeadBusy) {
    box.innerHTML = '<div class="v4-empty">Загружаю карточку заявки...</div>';
    return;
  }
  if (v4State.currentLeadError) {
    box.innerHTML = `<div class="v4-empty is-error">${esc(v4State.currentLeadError)}</div>`;
    return;
  }
  if (!v4State.currentLead) {
    box.innerHTML = '<div class="v4-empty">Карточка заявки ещё не загружена.</div>';
    return;
  }
  box.innerHTML = renderLeadDetails(v4State.currentLead);
  document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: v4State.route.leadId } }));
}

export async function loadCurrentLead(id = v4State.route.leadId) {
  if (!id || !v4State.crmReady) {
    renderCurrentLead();
    return null;
  }
  setState({ currentLeadBusy: true, currentLeadError: null, currentLead: null });
  renderCurrentLead();
  try {
    setStatus('Загружаю карточку заявки...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .select(FULL_LEAD_FIELDS)
        .eq('id', id)
        .single(),
      14000,
      'Карточка заявки не загрузилась за 14 секунд'
    );
    if (response.error) throw response.error;
    if (!response.data) throw new Error('Заявка не найдена');
    setState({ currentLead: response.data, currentLeadBusy: false, currentLeadError: null });
    renderCurrentLead();
    setStatus('Карточка заявки загружена', 'good');
    return response.data;
  } catch (error) {
    const message = friendlyError(error);
    setState({ currentLead: null, currentLeadBusy: false, currentLeadError: message });
    renderCurrentLead();
    setStatus(`Ошибка карточки заявки: ${message}`, 'error');
    return null;
  }
}

function clearLeadModules() {
  setState({
    currentLead: null,
    currentLeadError: null,
    currentLeadBusy: false,
    leadNeeds: [],
    leadNeedsError: null,
    leadNeedsBusy: false,
    calculations: [],
    calculationsError: null,
    calculationsBusy: false,
    offers: [],
    offersError: null,
    offersBusy: false
  });
}

function bindLeadCardEvents() {
  byId('leadCardSection')?.addEventListener('click', (event) => {
    if (event.target.closest('#backToLeadsBtn')) {
      clearLeadUrl();
      clearLeadModules();
      renderCurrentLead();
      return;
    }
    if (event.target.closest('#refreshLeadBtn')) {
      loadCurrentLead().then(() => toast('Карточка обновлена'));
    }
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    if (id) loadCurrentLead(id);
    else {
      clearLeadModules();
      renderCurrentLead();
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadCurrentLead(v4State.route.leadId);
  });
}

export function bootLeadCard() {
  bindLeadCardEvents();
  renderCurrentLead();
  if (v4State.crmReady && v4State.route.leadId) loadCurrentLead(v4State.route.leadId);
}

document.addEventListener('DOMContentLoaded', bootLeadCard);
