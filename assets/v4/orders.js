import { supabaseClient } from './supabase-client.js';
import { invokeLeaderFunction } from './functions-client.js';
import { friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

let orders = [];
let ordersBusy = false;
let ordersError = null;
let createBusy = false;
let previousOffers = null;
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

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function ensureHost() {
  if (byId('ordersBox')) return byId('ordersBox');
  const offersBox = byId('offersBox');
  if (!offersBox) return null;
  offersBox.insertAdjacentHTML('afterend', '<section id="ordersBox" class="v4-orders-host"><div class="v4-empty">Заказы загрузятся после открытия карточки.</div></section>');
  return byId('ordersBox');
}

function linkedOrderIds() {
  const ids = new Set();
  if (v4State.currentLead?.converted_order_id) ids.add(v4State.currentLead.converted_order_id);
  (v4State.offers || []).forEach((offer) => { if (offer.order_id) ids.add(offer.order_id); });
  (v4State.calculations || []).forEach((calc) => { if (calc.order_id) ids.add(calc.order_id); });
  return [...ids];
}

function eligibleOffers() {
  return (v4State.offers || []).filter((offer) => {
    if (offer.status !== 'Согласовано' || offer.order_id) return false;
    const calc = (v4State.calculations || []).find((item) => item.id === offer.calculation_id);
    return calc && !calc.order_id && Number(calc.client_total || 0) > 0;
  });
}

function orderTitleFromOffer(offer) {
  if (!offer) return '';
  const rawTitle = offer.title || 'Заказ РА Лидер';
  return rawTitle.replace(/^КП:\s*/i, '').trim() || rawTitle;
}

function offerOptions(selectedId = '') {
  const offers = eligibleOffers();
  if (!offers.length) return '<option value="">Нет согласованного КП без заказа</option>';
  const selected = selectedId || (offers.length === 1 ? offers[0].id : '');
  return [
    offers.length === 1 ? '' : '<option value="">Выберите согласованное КП</option>',
    ...offers.map((offer) => `<option value="${esc(offer.id)}" ${offer.id === selected ? 'selected' : ''}>${esc(offer.title || 'КП')} — ${money(offer.total_sum)}</option>`)
  ].join('');
}

function renderOrderCard(order) {
  const orderType = order.data?.order_type || '—';
  return `
    <article class="v4-order-card">
      <div class="v4-order-title-row">
        <h4>№${esc(order.order_number || String(order.id || '').slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</h4>
        <span>${esc(order.status || 'Новый')}</span>
      </div>
      <div class="v4-order-meta">
        <span><b>Клиент:</b> ${esc(order.client_name || '—')}</span>
        <span><b>Телефон:</b> ${esc(order.client_phone || '—')}</span>
        <span><b>Тип:</b> ${esc(orderType)}</span>
        <span><b>Срок:</b> ${formatDate(order.deadline)}</span>
      </div>
      <div class="v4-order-kpi">
        <div><span>Клиенту</span><b>${money(order.client_total)}</b></div>
        <div><span>Себестоимость</span><b>${money(order.contractor_cost)}</b></div>
        <div><span>Прибыль</span><b>${money(order.profit)}</b></div>
        <div><span>Оплата</span><b>${esc(order.payment_status || 'Не оплачено')}</b></div>
      </div>
    </article>
  `;
}

function renderCreateForm() {
  const offers = eligibleOffers();
  const firstOffer = offers[0] || null;
  const defaultTitle = orderTitleFromOffer(firstOffer);
  if (v4State.currentLead?.converted_order_id) {
    return '<div class="v4-empty">По этой заявке заказ уже создан. Повторное создание заблокировано.</div>';
  }
  if (!offers.length) {
    return '<div class="v4-empty">Для создания заказа сначала согласуйте КП, связанное с сохранённым расчётом.</div>';
  }
  return `
    <div class="v4-order-form">
      <h4>Создать заказ из согласованного КП</h4>
      <div class="v4-order-warning">Проверьте название, срок, статус макета и комментарий. После создания заказ будет связан с заявкой, расчётом и КП.</div>
      <div class="v4-form-grid">
        <label>Согласованное КП
          <select id="orderOfferId">${offerOptions(firstOffer?.id || '')}</select>
        </label>
        <label>Название заказа
          <input id="orderProjectName" value="${esc(defaultTitle)}" placeholder="Например: Баннер 3×2 для клиента">
        </label>
        <label>Тип заказа
          <select id="orderType"><option>Смешанный</option><option>Изготовление</option><option>Услуга</option></select>
        </label>
        <label>Срок
          <input id="orderDeadline" type="date" value="${defaultDeadline()}">
        </label>
        <label>Статус макета
          <select id="orderLayoutStatus"><option>Макета нет</option><option>Нужен дизайн</option><option>Клиент прислал макет</option><option>В работе у дизайнера</option><option>На согласовании</option><option>Согласован</option></select>
        </label>
        <label class="wide">Комментарий к заказу
          <textarea id="orderComment" rows="3" placeholder="Важные условия, доставка, монтаж, особенности производства"></textarea>
        </label>
      </div>
      <div class="v4-form-actions">
        <button id="createOrderV4Btn" type="button" class="v4-primary" ${createBusy ? 'disabled' : ''}>${createBusy ? 'Создаю заказ...' : 'Создать заказ'}</button>
      </div>
    </div>
  `;
}

export function renderOrders() {
  const box = ensureHost();
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '';
    return;
  }
  if (ordersBusy) {
    box.innerHTML = '<div class="v4-empty">Загружаю связанные заказы...</div>';
    return;
  }
  box.innerHTML = `
    <section class="v4-subcard v4-orders-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Заказ</h3>
          <p>Заказ создаётся только из согласованного КП и сохранённого расчёта.</p>
        </div>
        <span class="v4-muted">Заказов: ${orders.length}</span>
      </div>
      <div class="v4-orders-list">
        ${ordersError ? `<div class="v4-empty is-error">${esc(ordersError)}</div>` : orders.length ? orders.map(renderOrderCard).join('') : '<div class="v4-empty">Связанный заказ пока не создан.</div>'}
      </div>
      ${renderCreateForm()}
    </section>
  `;
}

export async function loadOrders() {
  ensureHost();
  const ids = linkedOrderIds();
  if (!v4State.route.leadId || !v4State.crmReady || !ids.length) {
    orders = [];
    ordersBusy = false;
    ordersError = null;
    renderOrders();
    return [];
  }
  ordersBusy = true;
  ordersError = null;
  renderOrders();
  try {
    const rows = [];
    for (const id of ids) {
      const response = await supabaseClient.from('leader_orders').select('*').eq('id', id).maybeSingle();
      if (response.error) throw response.error;
      if (response.data) rows.push(response.data);
    }
    orders = rows;
    ordersBusy = false;
    renderOrders();
    return rows;
  } catch (error) {
    orders = [];
    ordersBusy = false;
    ordersError = friendlyError(error);
    renderOrders();
    return [];
  }
}

async function loadOrderBundle(offerId) {
  const offerResponse = await supabaseClient.from('leader_commercial_offers').select('*').eq('id', offerId).single();
  if (offerResponse.error) throw offerResponse.error;
  const offer = offerResponse.data;
  if (offer.status !== 'Согласовано') throw new Error('Заказ можно создать только из согласованного КП');
  if (offer.order_id) throw new Error('По этому КП заказ уже создан');

  const calcResponse = await supabaseClient.from('leader_lead_calculations').select('*').eq('id', offer.calculation_id).single();
  if (calcResponse.error) throw calcResponse.error;
  const calculation = calcResponse.data;
  if (calculation.order_id) throw new Error('По этому расчёту заказ уже создан');
  if (Number(calculation.client_total || 0) <= 0) throw new Error('Сумма клиенту должна быть больше 0 ₽');

  const itemsResponse = await supabaseClient
    .from('leader_lead_calculation_items')
    .select('*')
    .eq('calculation_id', calculation.id)
    .order('sort_order', { ascending: true });
  if (itemsResponse.error) throw itemsResponse.error;
  const items = itemsResponse.data || [];
  if (!items.length) throw new Error('В расчёте нет позиций');
  const invalidItems = items.filter((item) => Number(item.qty || 0) <= 0 || Number(item.client_sum || 0) <= 0);
  if (invalidItems.length) throw new Error('В расчёте есть позиции с нулевым количеством или нулевой суммой клиенту');

  let lead = v4State.currentLead;
  if (!lead || lead.id !== calculation.lead_id) {
    const leadResponse = await supabaseClient.from('leader_leads').select('*').eq('id', calculation.lead_id).single();
    if (leadResponse.error) throw leadResponse.error;
    lead = leadResponse.data;
  }
  if (lead.converted_order_id) throw new Error('По этой заявке заказ уже создан');

  let need = null;
  if (calculation.need_id) {
    const needResponse = await supabaseClient.from('leader_lead_needs').select('*').eq('id', calculation.need_id).maybeSingle();
    if (needResponse.error) throw needResponse.error;
    need = needResponse.data || null;
  }

  return { offer, calculation, items, lead, need };
}

function buildRows(items) {
  return items.map((item) => ({
    catalog_id: item.catalog_id || null,
    category: item.category || null,
    item_type: item.item_type || 'Услуга',
    calculation_mode: item.data?.calculation_mode || null,
    min_client_price: item.data?.min_client_price ?? null,
    default_client_price: item.data?.default_client_price ?? null,
    markup_percent: item.markup_percent ?? null,
    name: `[${item.item_type || 'Услуга'}] ${item.name || 'Позиция'}`,
    unit: item.unit || 'шт',
    qty: Number(item.qty || 0),
    price: Number(item.contractor_price || 0),
    client_sum: Number(item.client_sum || 0),
    contractor_sum: Number(item.contractor_sum || 0),
    comment: item.comment || '',
    data: item.data || {}
  }));
}

async function updateLinks(bundle, order) {
  const now = new Date().toISOString();
  const responses = await Promise.all([
    supabaseClient.from('leader_lead_calculations').update({ order_id: order.id, status: 'Создан заказ', updated_at: now }).eq('id', bundle.calculation.id),
    supabaseClient.from('leader_commercial_offers').update({ order_id: order.id, updated_at: now }).eq('id', bundle.offer.id),
    supabaseClient.from('leader_leads').update({ status: 'Создан заказ', converted_order_id: order.id, converted_at: now }).eq('id', bundle.lead.id),
    supabaseClient.from('leader_commercial_offer_events').insert({
      offer_id: bundle.offer.id,
      lead_id: bundle.lead.id,
      calculation_id: bundle.calculation.id,
      event_type: 'Создан заказ',
      old_status: bundle.offer.status,
      new_status: bundle.offer.status,
      comment: `Создан заказ ${order.order_number || order.id}`,
      created_by: v4State.user?.id || null,
      created_by_email: v4State.user?.email || null
    })
  ]);
  return responses.filter((response) => response?.error).map((response) => response.error);
}

function captureOrderForm() {
  const offers = eligibleOffers();
  return {
    offerId: byId('orderOfferId')?.value || (offers.length === 1 ? offers[0].id : ''),
    projectName: byId('orderProjectName')?.value?.trim() || '',
    orderType: byId('orderType')?.value || 'Смешанный',
    deadline: byId('orderDeadline')?.value || '',
    layoutStatus: byId('orderLayoutStatus')?.value || 'Макета нет',
    comment: byId('orderComment')?.value?.trim() || ''
  };
}

async function createOrder() {
  if (createBusy) return;
  const form = captureOrderForm();
  if (!form.offerId) {
    toast('Выберите согласованное КП');
    return;
  }
  createBusy = true;
  renderOrders();
  try {
    setStatus('Создаю заказ...', 'warn');
    const bundle = await loadOrderBundle(form.offerId);
    const projectName = form.projectName || orderTitleFromOffer(bundle.offer) || bundle.calculation.title || 'Заказ РА Лидер';
    const comment = form.comment || bundle.calculation.public_comment || bundle.need?.description || '';
    const rows = buildRows(bundle.items);
    const totals = {
      cost: Number(bundle.calculation.contractor_cost || 0),
      total: Number(bundle.calculation.client_total || 0),
      profit: Number(bundle.calculation.profit || 0),
      balance: Number(bundle.calculation.client_total || 0)
    };

    const result = await invokeLeaderFunction('leader-crm-leads', {
      action: 'create_order',
      lead_id: bundle.lead.id,
      project_name: projectName,
      client_name: bundle.lead.name || '',
      client_phone: bundle.lead.phone || '',
      source: bundle.lead.source || 'CRM v4',
      order_type: form.orderType,
      deadline: form.deadline || bundle.need?.deadline_date || null,
      layout_status: form.layoutStatus || (bundle.need?.need_design ? 'Нужен дизайн' : 'Макета нет'),
      comment,
      payment_status: 'Не оплачено',
      rows,
      totals
    }, {
      timeoutMs: 25000,
      timeoutMessage: 'Создание заказа не завершилось за 25 секунд'
    });

    if (!result.order?.id) throw new Error('CRM не вернула созданный заказ');
    const order = result.order;
    const linkWarnings = await updateLinks(bundle, order);

    orders = [order, ...orders.filter((item) => item.id !== order.id)];
    setState({
      currentLead: { ...bundle.lead, status: 'Создан заказ', converted_order_id: order.id, converted_at: new Date().toISOString() },
      calculations: (v4State.calculations || []).map((calc) => calc.id === bundle.calculation.id ? { ...calc, status: 'Создан заказ', order_id: order.id } : calc),
      offers: (v4State.offers || []).map((offer) => offer.id === bundle.offer.id ? { ...offer, order_id: order.id } : offer),
      leads: (v4State.leads || []).map((lead) => lead.id === bundle.lead.id ? { ...lead, status: 'Создан заказ', converted_order_id: order.id } : lead)
    });
    renderOrders();
    setStatus('Заказ создан', 'good');
    toast(linkWarnings.length ? 'Заказ создан, но часть связей нужно проверить' : 'Заказ создан и связан с заявкой');
  } catch (error) {
    setStatus(`Ошибка создания заказа: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    createBusy = false;
    renderOrders();
  }
}

function bindOrderEvents() {
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target.closest('#createOrderV4Btn')) await createOrder();
  });

  byId('leadCardSection')?.addEventListener('change', (event) => {
    const select = event.target.closest('#orderOfferId');
    if (!select) return;
    const offer = eligibleOffers().find((item) => item.id === select.value);
    const input = byId('orderProjectName');
    if (offer && input && !input.value.trim()) input.value = orderTitleFromOffer(offer);
  });

  document.addEventListener('leader-v4:lead-card-rendered', () => {
    ensureHost();
    renderOrders();
  });

  document.addEventListener('leader-v4:route-change', (event) => {
    orders = [];
    ordersError = null;
    if (event.detail?.leadId) loadOrders();
    else renderOrders();
  });

  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadOrders();
  });

  subscribeState((state) => {
    const offersChanged = state.offers !== previousOffers;
    const calculationsChanged = state.calculations !== previousCalculations;
    if (!offersChanged && !calculationsChanged) return;
    previousOffers = state.offers;
    previousCalculations = state.calculations;
    if (byId('ordersBox')) {
      renderOrders();
      if (linkedOrderIds().length && !ordersBusy) loadOrders();
    }
  });
}

export function bootOrders() {
  previousOffers = v4State.offers;
  previousCalculations = v4State.calculations;
  bindOrderEvents();
  ensureHost();
  renderOrders();
  if (v4State.crmReady && v4State.route.leadId) loadOrders();
}

document.addEventListener('DOMContentLoaded', bootOrders);
