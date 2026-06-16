import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { clearLeadUrl } from './router.js';
import './offers-loader.js?v=20260616-3';

const FULL_LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,utm_source,utm_medium,utm_campaign,utm_content,utm_term,assigned_to,converted_order_id,converted_client_id,last_contact_at,next_contact_at,converted_at,reject_reason,lead_quality,estimated_amount';
const QUICK_STATUSES = [
  'В работе',
  'Уточнение деталей',
  'Расчёт подготовлен',
  'КП отправлено',
  'Ждём ответ',
  'Нужно пересчитать',
  'Согласовано',
  'Отказ',
  'Спам'
];
const DANGER_STATUSES = new Set(['Отказ', 'Спам']);

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

function formatInputDateTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  } catch (_) {
    return '';
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

function whatsappHref(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits ? `https://wa.me/${digits}` : '';
}

function payloadRows(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return Object.entries(payload)
    .slice(0, 12)
    .map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(typeof value === 'object' ? JSON.stringify(value) : value)}</dd></div>`)
    .join('');
}

function statusHint(lead) {
  const status = lead.status || 'Новая';
  if (lead.converted_order_id || status === 'Создан заказ') return 'Заказ уже создан. Дальше контролируйте производство, оплату и выдачу результата.';
  if (status === 'Новая') return 'Начните с звонка или WhatsApp, уточните задачу и переведите заявку в работу.';
  if (status === 'В работе') return 'Зафиксируйте потребность клиента, добавьте позиции расчёта и сохраните первый вариант.';
  if (status === 'Уточнение деталей') return 'Заполните размеры, материал, сроки, монтаж и всё, что влияет на цену.';
  if (status === 'Расчёт подготовлен') return 'Проверьте маржу и сформируйте коммерческое предложение.';
  if (status === 'КП отправлено') return 'Поставьте следующий контакт и вернитесь к клиенту, если он не ответит.';
  if (status === 'Ждём ответ') return 'Не оставляйте заявку без даты следующего контакта.';
  if (status === 'Нужно пересчитать') return 'Создайте новый вариант расчёта или измените условия предложения.';
  if (status === 'Согласовано') return 'Проверьте согласованное КП и создайте заказ.';
  if (['Отказ', 'Спам'].includes(status)) return 'Заявка закрыта. При необходимости верните её в работу одной кнопкой.';
  return 'Следуйте цепочке: потребность → расчёт → КП → согласование → заказ.';
}

function quickStatusButtons(lead) {
  const current = lead.status || 'Новая';
  return QUICK_STATUSES.map((status) => {
    const active = status === current ? ' is-active' : '';
    const danger = DANGER_STATUSES.has(status) ? ' is-danger' : '';
    return `<button type="button" class="v4-chip-button${active}${danger}" data-lead-status="${esc(status)}">${esc(status)}</button>`;
  }).join('');
}

function renderLeadDetails(lead) {
  const phone = phoneHref(lead.phone);
  const whatsapp = whatsappHref(lead.phone);
  const payloadHtml = payloadRows(lead.payload);
  const nextContactValue = formatInputDateTime(lead.next_contact_at);
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
          ${whatsapp ? `<a href="${esc(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div>
      </div>

      <section class="v4-subcard v4-action-panel">
        <div>
          <h3>Что сделать сейчас</h3>
          <p>${esc(statusHint(lead))}</p>
        </div>
        <div class="v4-quick-actions" aria-label="Быстрая смена статуса">
          ${quickStatusButtons(lead)}
        </div>
        <div class="v4-next-contact-row">
          <label>Следующий контакт
            <input id="leadNextContactInput" type="datetime-local" value="${esc(nextContactValue)}">
          </label>
          <button type="button" data-next-contact="save" class="v4-primary">Сохранить дату</button>
          <button type="button" data-next-contact="plus1h">+1 час</button>
          <button type="button" data-next-contact="tomorrow">Завтра 10:00</button>
          <button type="button" data-next-contact="plus3d">Через 3 дня</button>
        </div>
      </section>

      <div class="v4-workflow-guide">
        <div class="is-done"><b>1</b><span>Заявка</span></div>
        <div><b>2</b><span>Потребности</span></div>
        <div><b>3</b><span>Расчёт</span></div>
        <div><b>4</b><span>КП</span></div>
        <div><b>5</b><span>Заказ</span></div>
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
            <p>Сначала зафиксируйте, что именно нужно клиенту: размеры, материал, сроки, монтаж, дизайн и особые условия.</p>
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

function mergeLead(updatedLead) {
  if (!updatedLead) return;
  setState({
    currentLead: { ...(v4State.currentLead || {}), ...updatedLead },
    leads: (v4State.leads || []).map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead))
  });
}

async function updateCurrentLead(patch, successText) {
  const leadId = v4State.currentLead?.id || v4State.route.leadId;
  if (!leadId) return null;
  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select(FULL_LEAD_FIELDS)
      .single(),
    12000,
    'Заявка не обновилась за 12 секунд'
  );
  if (response.error) throw response.error;
  mergeLead(response.data);
  renderCurrentLead();
  if (successText) toast(successText);
  return response.data;
}

function nextContactDate(kind) {
  const date = new Date();
  if (kind === 'plus1h') date.setHours(date.getHours() + 1);
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

async function saveNextContact(kind) {
  const input = byId('leadNextContactInput');
  let value = input?.value || '';
  if (kind && kind !== 'save') {
    value = formatInputDateTime(nextContactDate(kind).toISOString());
    if (input) input.value = value;
  }
  if (!value) {
    toast('Укажите дату следующего контакта');
    return;
  }
  const isoValue = new Date(value).toISOString();
  await updateCurrentLead({ next_contact_at: isoValue, status: v4State.currentLead?.status || 'Ждём ответ' }, 'Следующий контакт сохранён');
  setStatus('Следующий контакт обновлён', 'good');
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
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target.closest('#backToLeadsBtn')) {
      clearLeadUrl();
      clearLeadModules();
      renderCurrentLead();
      return;
    }
    if (event.target.closest('#refreshLeadBtn')) {
      loadCurrentLead().then(() => toast('Карточка обновлена'));
      return;
    }
    const statusButton = event.target.closest('button[data-lead-status]');
    if (statusButton) {
      statusButton.disabled = true;
      const status = statusButton.dataset.leadStatus;
      try {
        setStatus(`Меняю статус заявки: ${status}...`, 'warn');
        await updateCurrentLead({ status }, `Статус: ${status}`);
        setStatus(`Статус заявки обновлён: ${status}`, DANGER_STATUSES.has(status) ? 'warn' : 'good');
      } catch (error) {
        toast(friendlyError(error));
        setStatus(`Ошибка смены статуса: ${friendlyError(error)}`, 'error');
      } finally {
        statusButton.disabled = false;
      }
      return;
    }
    const nextContactButton = event.target.closest('button[data-next-contact]');
    if (nextContactButton) {
      nextContactButton.disabled = true;
      try {
        await saveNextContact(nextContactButton.dataset.nextContact);
      } catch (error) {
        toast(friendlyError(error));
        setStatus(`Ошибка даты контакта: ${friendlyError(error)}`, 'error');
      } finally {
        nextContactButton.disabled = false;
      }
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
