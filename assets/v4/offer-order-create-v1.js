import { supabaseClient } from './supabase-client.js';
import { invokeLeaderFunction } from './functions-client.js';
import { friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { setStatus, toast } from './ui.js';

let busy = false;
let booted = false;
let lastOfferId = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}
function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}
function orderTitleFromOffer(offer, calculation) {
  const raw = offer?.title || calculation?.title || 'Заказ РА Лидер';
  return raw.replace(/^КП:\s*/i, '').replace(/^Коммерческое предложение[:\s-]*/i, '').trim() || raw;
}
function host() {
  return document.querySelector('#offerCardV1 .v4-offer-modal-card');
}
function currentOfferId() {
  return document.querySelector('#offerCardV1 [data-edit-type="offer"][data-edit-id]')?.dataset.editId || '';
}
function ensureStyles() {
  if (document.getElementById('offerOrderCreateV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'offerOrderCreateV1Styles';
  style.textContent = `
    .v4-offer-order-create{border:1px solid #bbf7d0;background:#f0fdf4;border-radius:18px;padding:14px;margin-top:12px}
    .v4-offer-order-create h3{margin:0 0 8px;color:#166534}.v4-offer-order-create p{margin:0 0 10px;color:#166534;font-weight:800}
    .v4-offer-order-warning{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:14px;padding:10px 12px;margin:10px 0;font-weight:800}
    .v4-offer-order-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-offer-order-actions button{min-width:160px}
    @media(max-width:680px){.v4-offer-order-actions{display:grid}.v4-offer-order-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

async function loadBundle(offerId) {
  const offerResponse = await supabaseClient.from('leader_commercial_offers').select('*').eq('id', offerId).single();
  if (offerResponse.error || !offerResponse.data) throw offerResponse.error || new Error('КП не найдено');
  const offer = offerResponse.data;
  if (offer.status !== 'Согласовано') return { offer, canCreate: false, reason: 'Заказ можно создать только из согласованного КП.' };
  if (offer.order_id) return { offer, canCreate: false, reason: 'По этому КП заказ уже создан.' };

  const calcResponse = await supabaseClient.from('leader_lead_calculations').select('*').eq('id', offer.calculation_id).single();
  if (calcResponse.error || !calcResponse.data) throw calcResponse.error || new Error('Связанный расчёт не найден');
  const calculation = calcResponse.data;
  if (calculation.order_id) return { offer, calculation, canCreate: false, reason: 'По связанному расчёту заказ уже создан.' };
  if (Number(calculation.client_total || 0) <= 0) return { offer, calculation, canCreate: false, reason: 'Сумма расчёта клиенту должна быть больше 0 ₽.' };

  const itemsResponse = await supabaseClient
    .from('leader_lead_calculation_items')
    .select('*')
    .eq('calculation_id', calculation.id)
    .order('sort_order', { ascending: true });
  if (itemsResponse.error) throw itemsResponse.error;
  const items = itemsResponse.data || [];
  if (!items.length) return { offer, calculation, items, canCreate: false, reason: 'В связанном расчёте нет позиций.' };

  const leadResponse = await supabaseClient.from('leader_leads').select('*').eq('id', calculation.lead_id || offer.lead_id).single();
  if (leadResponse.error || !leadResponse.data) throw leadResponse.error || new Error('Связанная заявка не найдена');
  const lead = leadResponse.data;
  if (lead.converted_order_id) return { offer, calculation, items, lead, canCreate: false, reason: 'По этой заявке заказ уже создан.' };

  let need = null;
  if (calculation.need_id) {
    const needResponse = await supabaseClient.from('leader_lead_needs').select('*').eq('id', calculation.need_id).maybeSingle();
    if (needResponse.error) throw needResponse.error;
    need = needResponse.data || null;
  }

  return { offer, calculation, items, lead, need, canCreate: true, reason: '' };
}

function buildRows(items) {
  return (items || []).map((item) => ({
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
    supabaseClient.from('leader_leads').update({ status: 'Создан заказ', converted_order_id: order.id, converted_at: now, updated_at: now }).eq('id', bundle.lead.id),
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

function renderDisabled(reason) {
  const container = host();
  if (!container || container.querySelector('#offerOrderCreateBox')) return;
  container.insertAdjacentHTML('beforeend', `<section id="offerOrderCreateBox" class="v4-offer-order-create"><h3>Создание заказа из КП</h3><div class="v4-offer-order-warning">${esc(reason)}</div></section>`);
}

function renderForm(bundle) {
  const container = host();
  if (!container) return;
  const old = container.querySelector('#offerOrderCreateBox');
  if (old) old.remove();
  const title = orderTitleFromOffer(bundle.offer, bundle.calculation);
  const comment = bundle.calculation.public_comment || bundle.need?.description || '';
  container.insertAdjacentHTML('beforeend', `
    <section id="offerOrderCreateBox" class="v4-offer-order-create">
      <h3>Создать заказ из этого КП</h3>
      <p>КП согласовано, заказ ещё не создан. Проверьте параметры запуска.</p>
      <div class="v4-offer-order-warning">После создания заказ будет связан с КП, расчётом и заявкой. Состав позиций перенесётся из расчёта.</div>
      <div class="v4-form-grid">
        <label>Название заказа
          <input id="offerOrderProjectName" value="${esc(title)}" placeholder="Например: Баннер 3×2 для клиента">
        </label>
        <label>Тип заказа
          <select id="offerOrderType"><option>Смешанный</option><option>Изготовление</option><option>Услуга</option></select>
        </label>
        <label>Срок
          <input id="offerOrderDeadline" type="date" value="${defaultDeadline()}">
        </label>
        <label>Статус макета
          <select id="offerOrderLayoutStatus"><option>Макета нет</option><option>Нужен дизайн</option><option>Клиент прислал макет</option><option>В работе у дизайнера</option><option>На согласовании</option><option>Согласован</option></select>
        </label>
        <label>Предоплата, ₽
          <input id="offerOrderPrepayment" type="number" step="1" value="0">
        </label>
        <label>Статус оплаты
          <select id="offerOrderPaymentStatus"><option>Не оплачено</option><option>Предоплата</option><option>Частично оплачено</option><option>Оплачено</option></select>
        </label>
        <label class="wide">Комментарий к заказу
          <textarea id="offerOrderComment" rows="3" placeholder="Важные условия, доставка, монтаж, особенности производства">${esc(comment)}</textarea>
        </label>
      </div>
      <div class="v4-offer-order-actions">
        <button type="button" class="v4-primary" data-create-order-from-offer="${esc(bundle.offer.id)}" ${busy ? 'disabled' : ''}>${busy ? 'Создаю...' : 'Создать заказ'}</button>
        <button type="button" data-offer-order-refresh="${esc(bundle.offer.id)}">Обновить проверку</button>
      </div>
    </section>`);
}

async function enhanceOfferCard(force = false) {
  const offerId = currentOfferId();
  if (!offerId) return;
  if (!force && offerId === lastOfferId && document.getElementById('offerOrderCreateBox')) return;
  lastOfferId = offerId;
  try {
    const bundle = await loadBundle(offerId);
    if (!bundle.canCreate) renderDisabled(bundle.reason || 'Заказ из этого КП сейчас создать нельзя.');
    else renderForm(bundle);
  } catch (error) {
    renderDisabled(friendlyError(error));
  }
}

function formData() {
  return {
    projectName: document.getElementById('offerOrderProjectName')?.value?.trim() || '',
    orderType: document.getElementById('offerOrderType')?.value || 'Смешанный',
    deadline: document.getElementById('offerOrderDeadline')?.value || '',
    layoutStatus: document.getElementById('offerOrderLayoutStatus')?.value || 'Макета нет',
    prepayment: Number(document.getElementById('offerOrderPrepayment')?.value || 0),
    paymentStatus: document.getElementById('offerOrderPaymentStatus')?.value || 'Не оплачено',
    comment: document.getElementById('offerOrderComment')?.value?.trim() || ''
  };
}

async function createOrderFromOffer(offerId) {
  if (busy) return;
  busy = true;
  try {
    setStatus('Создаю заказ из КП...', 'warn');
    const bundle = await loadBundle(offerId);
    if (!bundle.canCreate) throw new Error(bundle.reason || 'Заказ из этого КП сейчас создать нельзя');
    const form = formData();
    const projectName = form.projectName || orderTitleFromOffer(bundle.offer, bundle.calculation);
    const rows = buildRows(bundle.items);
    const clientTotal = Number(bundle.calculation.client_total || 0);
    const contractorCost = Number(bundle.calculation.contractor_cost || 0);
    const prepayment = Math.max(0, Number(form.prepayment || 0));
    const totals = {
      cost: contractorCost,
      total: clientTotal,
      profit: Number(bundle.calculation.profit || clientTotal - contractorCost),
      prepayment,
      balance: Math.max(clientTotal - prepayment, 0)
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
      comment: form.comment || bundle.calculation.public_comment || bundle.need?.description || '',
      payment_status: form.paymentStatus,
      rows,
      totals
    }, {
      timeoutMs: 25000,
      timeoutMessage: 'Создание заказа не завершилось за 25 секунд'
    });

    if (!result.order?.id) throw new Error('CRM не вернула созданный заказ');
    const order = result.order;
    const linkWarnings = await updateLinks(bundle, order);

    setState({
      currentLead: v4State.currentLead?.id === bundle.lead.id ? { ...v4State.currentLead, status: 'Создан заказ', converted_order_id: order.id, converted_at: new Date().toISOString() } : v4State.currentLead,
      calculations: (v4State.calculations || []).map((calc) => calc.id === bundle.calculation.id ? { ...calc, status: 'Создан заказ', order_id: order.id } : calc),
      offers: (v4State.offers || []).map((offer) => offer.id === bundle.offer.id ? { ...offer, order_id: order.id } : offer),
      leads: (v4State.leads || []).map((lead) => lead.id === bundle.lead.id ? { ...lead, status: 'Создан заказ', converted_order_id: order.id } : lead)
    });

    setStatus('Заказ создан из КП', 'good');
    toast(linkWarnings.length ? 'Заказ создан, но часть связей нужно проверить' : 'Заказ создан и связан с КП');
    window.LeaderV4CurrentOrderId = order.id;
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order } }));
    document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: bundle.lead.id } }));
    await enhanceOfferCard(true);
  } catch (error) {
    setStatus(`Ошибка создания заказа: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    busy = false;
    await enhanceOfferCard(true);
  }
}

function boot() {
  ensureStyles();
  if (booted) return;
  booted = true;
  document.addEventListener('click', (event) => {
    const create = event.target.closest?.('[data-create-order-from-offer]');
    if (create) {
      event.preventDefault();
      event.stopPropagation();
      createOrderFromOffer(create.dataset.createOrderFromOffer);
      return;
    }
    const refresh = event.target.closest?.('[data-offer-order-refresh]');
    if (refresh) {
      event.preventDefault();
      event.stopPropagation();
      lastOfferId = '';
      enhanceOfferCard(true);
    }
  }, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-open-offer-card]')) setTimeout(() => enhanceOfferCard(true), 900);
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(() => enhanceOfferCard(true), 500));
}
boot();
