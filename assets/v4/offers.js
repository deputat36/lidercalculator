import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

let activeOfferId = null;
let createBusy = false;
let previousCalculations = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function validUntilDefault() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function calculationOptions(selected = '') {
  const calculations = v4State.calculations || [];
  if (!calculations.length) return '<option value="">Сначала сохраните расчёт</option>';
  return [
    '<option value="">Выберите расчёт</option>',
    ...calculations.map((calc) => `<option value="${esc(calc.id)}" ${calc.id === selected ? 'selected' : ''}>${esc(calc.title || 'Расчёт')} — ${money(calc.client_total)}</option>`)
  ].join('');
}

function needDescription(need) {
  if (!need) return '';
  const data = need.structured_data && typeof need.structured_data === 'object' ? need.structured_data : {};
  const lines = [];
  if (need.title) lines.push(need.title);
  if (need.description) lines.push(need.description);
  if (data.width || data.height) lines.push(`Размер: ${data.width || '—'} × ${data.height || '—'}`);
  if (data.quantity) lines.push(`Количество: ${data.quantity}`);
  if (data.print_run) lines.push(`Тираж / формат: ${data.print_run}`);
  if (data.material) lines.push(`Материал: ${data.material}`);
  if (need.deadline_text) lines.push(`Желаемый срок: ${need.deadline_text}`);
  if (need.need_design) lines.push('Требуется дизайн или подготовка макета.');
  if (need.need_installation) lines.push('Монтаж предусмотрен или требует согласования.');
  return lines.join('\n');
}

function publicItems(items) {
  return (items || []).filter((item) => Number(item.client_sum || 0) > 0);
}

function buildOfferTexts({ calculation, items, lead, need, validUntil, extraComment }) {
  const visibleItems = publicItems(items);
  const shortLines = [
    `Здравствуйте${lead?.name ? `, ${lead.name}` : ''}! Подготовили расчёт по вашей заявке.`,
    '',
    `${calculation.title || 'Работы по заявке'} — ${money(calculation.client_total)}.`
  ];
  if (visibleItems.length) {
    shortLines.push('', 'В стоимость входит:');
    visibleItems.slice(0, 8).forEach((item) => shortLines.push(`— ${item.name}`));
  }
  shortLines.push('', 'Срок выполнения уточняется после согласования макета и предоплаты.');
  shortLines.push('Для запуска нужно подтвердить заказ и внести предоплату.');
  if (extraComment) shortLines.push('', extraComment);

  const fullLines = [
    'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    'РА «Лидер»',
    `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
    '',
    `Клиент: ${lead?.name || 'не указано'}`
  ];
  if (lead?.phone) fullLines.push(`Телефон: ${lead.phone}`);
  fullLines.push('', 'Задача клиента');
  fullLines.push(needDescription(need) || calculation.title || lead?.service || 'Работы по заявке');
  fullLines.push('', 'Состав предложения');
  if (visibleItems.length) {
    visibleItems.forEach((item) => {
      const qty = Number(item.qty || 0);
      const unit = item.unit || '';
      fullLines.push(`— ${item.name}${qty ? ` — ${qty.toLocaleString('ru-RU')} ${unit}` : ''} — ${money(item.client_sum)}`);
    });
  } else {
    fullLines.push('— Работы по согласованной заявке');
  }
  fullLines.push('', `Итоговая стоимость: ${money(calculation.client_total)}`);
  fullLines.push('', 'Условия запуска');
  fullLines.push('1. Подтвердить состав работ и стоимость.');
  fullLines.push('2. Внести предоплату.');
  fullLines.push('3. Передать материалы или согласовать разработку дизайна.');
  fullLines.push('4. Согласовать финальный макет перед производством.');
  if (calculation.public_comment) fullLines.push('', `Примечание: ${calculation.public_comment}`);
  if (extraComment) fullLines.push('', `Дополнительные условия: ${extraComment}`);
  fullLines.push('', `Срок действия предложения: до ${formatDate(validUntil)}.`);
  fullLines.push('Срок выполнения зависит от согласования макета, наличия материалов и загрузки производства.');

  return {
    shortText: shortLines.join('\n'),
    fullText: fullLines.join('\n')
  };
}

function statusClass(status) {
  if (status === 'Согласовано') return 'is-good';
  if (status === 'КП отправлено') return 'is-warn';
  if (status === 'Отклонено') return 'is-error';
  return '';
}

function renderOfferCard(offer) {
  const isActive = offer.id === activeOfferId;
  return `
    <article class="v4-offer-card" data-id="${esc(offer.id)}">
      <div>
        <div class="v4-offer-title-row">
          <h4>${esc(offer.title || 'Коммерческое предложение')}</h4>
          <span class="${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span>
        </div>
        <div class="v4-offer-meta">
          <span><b>Сумма:</b> ${money(offer.total_sum)}</span>
          <span><b>Действует до:</b> ${formatDate(offer.valid_until)}</span>
          <span><b>Создано:</b> ${formatDate(offer.created_at)}</span>
        </div>
      </div>
      <div class="v4-offer-actions">
        <button type="button" data-action="preview-offer">${isActive ? 'Скрыть' : 'Показать'}</button>
        <button type="button" data-action="copy-short-offer">Копировать короткое</button>
        <button type="button" data-action="copy-full-offer">Копировать полное</button>
        ${offer.status !== 'КП отправлено' && offer.status !== 'Согласовано' ? '<button type="button" data-action="mark-offer-sent">КП отправлено</button>' : ''}
        ${offer.status !== 'Согласовано' ? '<button type="button" data-action="approve-offer" class="v4-primary">Согласовано</button>' : ''}
        ${offer.status !== 'Отклонено' && offer.status !== 'Согласовано' ? '<button type="button" data-action="reject-offer">Отклонено</button>' : ''}
      </div>
      ${isActive ? `
        <div class="v4-offer-preview">
          <div>
            <h5>Подробное КП</h5>
            <pre>${esc(offer.full_text || '')}</pre>
          </div>
          <div>
            <h5>Короткое сообщение</h5>
            <pre>${esc(offer.short_text || '')}</pre>
          </div>
        </div>
      ` : ''}
    </article>
  `;
}

function renderCreateForm() {
  return `
    <div class="v4-offer-form">
      <h4>Сформировать КП из расчёта</h4>
      <div class="v4-form-grid">
        <label>Расчёт
          <select id="offerCalculationId">${calculationOptions()}</select>
        </label>
        <label>Название КП
          <input id="offerTitle" placeholder="Например: КП на изготовление баннера">
        </label>
        <label>Действует до
          <input id="offerValidUntil" type="date" value="${validUntilDefault()}">
        </label>
        <label class="wide">Дополнительные условия для клиента
          <textarea id="offerExtraComment" rows="2" placeholder="Предоплата, доставка, сроки, особенности монтажа"></textarea>
        </label>
      </div>
      <div class="v4-form-actions">
        <button id="createOfferBtn" type="button" class="v4-primary" ${v4State.calculations.length ? '' : 'disabled'}>Сформировать КП</button>
      </div>
      <p class="v4-muted">В клиентском тексте не показываются себестоимость, прибыль, маржа и цены подрядчиков.</p>
    </div>
  `;
}

export function renderOffers() {
  const box = byId('offersBox');
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '';
    return;
  }
  if (v4State.offersBusy) {
    box.innerHTML = '<div class="v4-empty">Загружаю коммерческие предложения...</div>';
    return;
  }
  const offers = v4State.offers || [];
  box.innerHTML = `
    <section class="v4-subcard v4-offers-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Коммерческие предложения</h3>
          <p>КП формируется только из сохранённого расчёта и содержит только клиентские цены.</p>
        </div>
        <span class="v4-muted">КП: ${offers.length}</span>
      </div>
      <div class="v4-offers-list">
        ${v4State.offersError ? `<div class="v4-empty is-error">${esc(v4State.offersError)}</div>` : offers.length ? offers.map(renderOfferCard).join('') : '<div class="v4-empty">Коммерческих предложений пока нет.</div>'}
      </div>
      ${renderCreateForm()}
    </section>
  `;
}

export async function loadOffers(leadId = v4State.route.leadId) {
  if (!leadId || !v4State.crmReady) {
    setState({ offers: [], offersBusy: false, offersError: null });
    renderOffers();
    return [];
  }
  setState({ offersBusy: true, offersError: null });
  renderOffers();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_commercial_offers')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      12000,
      'Коммерческие предложения не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    setState({ offers: response.data || [], offersBusy: false, offersError: null });
    renderOffers();
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    setState({ offers: [], offersBusy: false, offersError: message });
    renderOffers();
    setStatus(`Ошибка загрузки КП: ${message}`, 'error');
    return [];
  }
}

async function loadCalculationBundle(calculationId) {
  const calculationResponse = await timeout(
    supabaseClient.from('leader_lead_calculations').select('*').eq('id', calculationId).single(),
    12000,
    'Расчёт не загрузился за 12 секунд'
  );
  if (calculationResponse.error) throw calculationResponse.error;
  const calculation = calculationResponse.data;

  const itemsResponse = await timeout(
    supabaseClient
      .from('leader_lead_calculation_items')
      .select('*')
      .eq('calculation_id', calculationId)
      .order('sort_order', { ascending: true }),
    12000,
    'Позиции расчёта не загрузились за 12 секунд'
  );
  if (itemsResponse.error) throw itemsResponse.error;

  let lead = v4State.currentLead;
  if (!lead || lead.id !== calculation.lead_id) {
    const leadResponse = await supabaseClient.from('leader_leads').select('*').eq('id', calculation.lead_id).single();
    if (leadResponse.error) throw leadResponse.error;
    lead = leadResponse.data;
  }

  let need = null;
  if (calculation.need_id) {
    const needResponse = await supabaseClient.from('leader_lead_needs').select('*').eq('id', calculation.need_id).maybeSingle();
    if (needResponse.error) throw needResponse.error;
    need = needResponse.data || null;
  }

  return { calculation, items: itemsResponse.data || [], lead, need };
}

async function writeOfferEvent({ offerId, leadId, calculationId, eventType, newStatus, comment }) {
  try {
    await supabaseClient.from('leader_commercial_offer_events').insert({
      offer_id: offerId,
      lead_id: leadId,
      calculation_id: calculationId,
      event_type: eventType,
      new_status: newStatus,
      comment: comment || ''
    });
  } catch (error) {
    console.warn('CRM v4 offer event warning:', error);
  }
}

async function createOffer() {
  if (createBusy) return;
  const calculationId = byId('offerCalculationId')?.value || '';
  if (!calculationId) {
    toast('Выберите сохранённый расчёт');
    return;
  }
  createBusy = true;
  const button = byId('createOfferBtn');
  if (button) button.disabled = true;
  try {
    setStatus('Формирую коммерческое предложение...', 'warn');
    const bundle = await loadCalculationBundle(calculationId);
    const calculation = bundle.calculation;
    const visibleItems = publicItems(bundle.items);
    if (Number(calculation.client_total || 0) <= 0) throw new Error('Сумма клиенту должна быть больше 0 ₽');
    if (!visibleItems.length) throw new Error('В расчёте нет позиций с клиентской стоимостью');

    const validUntil = byId('offerValidUntil')?.value || validUntilDefault();
    const extraComment = byId('offerExtraComment')?.value?.trim() || '';
    const texts = buildOfferTexts({ ...bundle, validUntil, extraComment });
    const title = byId('offerTitle')?.value?.trim() || `КП: ${calculation.title || 'Расчёт'}`;

    const response = await timeout(
      supabaseClient
        .from('leader_commercial_offers')
        .insert({
          lead_id: calculation.lead_id,
          calculation_id: calculation.id,
          client_id: calculation.client_id || null,
          order_id: calculation.order_id || null,
          offer_type: 'Подробное + короткое',
          title,
          short_text: texts.shortText,
          full_text: texts.fullText,
          total_sum: calculation.client_total,
          valid_until: validUntil,
          status: 'Черновик'
        })
        .select('*')
        .single(),
      14000,
      'Коммерческое предложение не сохранилось за 14 секунд'
    );
    if (response.error) throw response.error;
    const offer = response.data;

    const calcUpdate = await supabaseClient
      .from('leader_lead_calculations')
      .update({ commercial_offer_id: offer.id, status: 'КП сформировано', updated_at: new Date().toISOString() })
      .eq('id', calculation.id)
      .select('*')
      .single();
    if (calcUpdate.error) throw calcUpdate.error;

    await writeOfferEvent({
      offerId: offer.id,
      leadId: calculation.lead_id,
      calculationId: calculation.id,
      eventType: 'Создано КП',
      newStatus: 'Черновик',
      comment: 'КП сформировано из сохранённого расчёта'
    });

    activeOfferId = offer.id;
    setState({
      offers: [offer, ...(v4State.offers || [])],
      calculations: (v4State.calculations || []).map((calc) => calc.id === calculation.id ? { ...calc, ...calcUpdate.data } : calc)
    });
    renderOffers();
    setStatus('Коммерческое предложение сформировано', 'good');
    toast('КП сформировано');
  } catch (error) {
    setStatus(`Ошибка формирования КП: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    createBusy = false;
    const currentButton = byId('createOfferBtn');
    if (currentButton) currentButton.disabled = !v4State.calculations.length;
  }
}

async function updateOfferStatus(offerId, status) {
  const current = (v4State.offers || []).find((offer) => offer.id === offerId);
  if (!current) return;
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'КП отправлено') patch.sent_at = new Date().toISOString();
  if (status === 'Согласовано') patch.approved_at = new Date().toISOString();

  const response = await timeout(
    supabaseClient.from('leader_commercial_offers').update(patch).eq('id', offerId).select('*').single(),
    12000,
    'Статус КП не обновился за 12 секунд'
  );
  if (response.error) throw response.error;
  const updated = response.data;

  const calculationStatus = status === 'КП отправлено' ? 'КП отправлено' : status === 'Согласовано' ? 'Согласован' : status === 'Отклонено' ? 'Отклонён' : 'КП сформировано';
  if (updated.calculation_id) {
    await supabaseClient
      .from('leader_lead_calculations')
      .update({ status: calculationStatus, updated_at: new Date().toISOString() })
      .eq('id', updated.calculation_id);
  }

  await writeOfferEvent({
    offerId,
    leadId: updated.lead_id,
    calculationId: updated.calculation_id,
    eventType: 'Изменение статуса КП',
    newStatus: status,
    comment: `Статус изменён на ${status}`
  });

  setState({ offers: (v4State.offers || []).map((offer) => offer.id === offerId ? updated : offer) });
  renderOffers();
  toast(`Статус КП: ${status}`);
}

async function copyText(text) {
  if (!text) throw new Error('Текст КП пуст');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function bindOfferEvents() {
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target.closest('#createOfferBtn')) {
      await createOffer();
      return;
    }
    const actionButton = event.target.closest('button[data-action]');
    const card = actionButton?.closest('.v4-offer-card');
    const offerId = card?.dataset.id;
    if (!actionButton || !offerId) return;
    const offer = (v4State.offers || []).find((item) => item.id === offerId);
    if (!offer) return;
    try {
      const action = actionButton.dataset.action;
      if (action === 'preview-offer') {
        activeOfferId = activeOfferId === offerId ? null : offerId;
        renderOffers();
      }
      if (action === 'copy-short-offer') {
        await copyText(offer.short_text || '');
        toast('Короткое КП скопировано');
      }
      if (action === 'copy-full-offer') {
        await copyText(offer.full_text || '');
        toast('Подробное КП скопировано');
      }
      if (action === 'mark-offer-sent') await updateOfferStatus(offerId, 'КП отправлено');
      if (action === 'approve-offer') await updateOfferStatus(offerId, 'Согласовано');
      if (action === 'reject-offer') await updateOfferStatus(offerId, 'Отклонено');
    } catch (error) {
      toast(friendlyError(error));
      setStatus(`Ошибка работы с КП: ${friendlyError(error)}`, 'error');
    }
  });

  document.addEventListener('leader-v4:lead-card-rendered', () => renderOffers());
  document.addEventListener('leader-v4:route-change', (event) => {
    activeOfferId = null;
    const id = event.detail?.leadId || null;
    if (id) loadOffers(id);
    else {
      setState({ offers: [], offersBusy: false, offersError: null });
      renderOffers();
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadOffers(v4State.route.leadId);
  });

  subscribeState((state) => {
    if (state.calculations === previousCalculations) return;
    previousCalculations = state.calculations;
    if (byId('offersBox')) renderOffers();
  });
}

export function bootOffers() {
  previousCalculations = v4State.calculations;
  bindOfferEvents();
  renderOffers();
  if (v4State.crmReady && v4State.route.leadId) loadOffers(v4State.route.leadId);
}

document.addEventListener('DOMContentLoaded', bootOffers);
