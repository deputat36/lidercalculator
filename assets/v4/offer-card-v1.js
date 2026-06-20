import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';

let busy = false;
let booted = false;
let lastEnhanceAt = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}
function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}
function dateTimeRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}
function shortId(id) { return String(id || '').slice(0, 8); }

function ensureStyles() {
  if (document.getElementById('offerCardV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'offerCardV1Styles';
  style.textContent = `
    .v4-offer-modal{position:fixed;inset:0;z-index:695;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}
    .v4-offer-modal-card{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #fed7aa;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}
    .v4-offer-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-offer-head h2{margin:0}.v4-offer-head p{margin:6px 0 0;color:#64748b}
    .v4-offer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:12px 0}.v4-offer-grid div{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:12px}.v4-offer-grid span{display:block;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}.v4-offer-grid b{display:block;margin-top:5px;color:#0f172a}
    .v4-offer-columns{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-top:12px}.v4-offer-section{border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff}.v4-offer-section h3{margin:0 0 10px}
    .v4-offer-text{white-space:pre-wrap;border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:12px;max-height:420px;overflow:auto;font-family:Arial,sans-serif;line-height:1.45}.v4-offer-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.v4-offer-tabs button.is-active{background:#ea580c;color:#fff;border-color:#ea580c}
    .v4-offer-row{border:1px solid #e2e8f0;border-radius:14px;padding:10px;margin:8px 0;background:#f8fafc}.v4-offer-row-head{display:flex;justify-content:space-between;gap:10px}.v4-offer-row-head b{overflow-wrap:anywhere}
    .v4-offer-actions-line{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-offer-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:12px;color:#64748b;background:#f8fafc}.v4-offer-close{white-space:nowrap}
    @media(max-width:860px){.v4-offer-modal-card{padding:12px;border-radius:18px}.v4-offer-head,.v4-offer-columns{display:grid;grid-template-columns:1fr}.v4-offer-actions-line button,.v4-offer-tabs button{width:100%}}
  `;
  document.head.appendChild(style);
}
function host() {
  let element = document.getElementById('offerCardV1');
  if (!element) {
    element = document.createElement('div');
    element.id = 'offerCardV1';
    document.body.appendChild(element);
  }
  return element;
}
function closeCard() {
  host().innerHTML = '';
  busy = false;
}
function loading() {
  host().innerHTML = `<div class="v4-offer-modal"><div class="v4-offer-modal-card"><div class="v4-offer-head"><div><h2>Карточка КП</h2><p>Загружаю коммерческое предложение...</p></div><button type="button" class="v4-offer-close" data-offer-card-close>Закрыть</button></div><div class="v4-offer-empty">Загрузка...</div></div></div>`;
}
function errorBox(text) {
  host().innerHTML = `<div class="v4-offer-modal"><div class="v4-offer-modal-card"><div class="v4-offer-head"><div><h2>Карточка КП</h2><p>Не удалось загрузить данные</p></div><button type="button" class="v4-offer-close" data-offer-card-close>Закрыть</button></div><div class="v4-offer-empty">${esc(text)}</div></div></div>`;
}

async function fetchOffer(offerId) {
  const response = await supabaseClient
    .from('leader_commercial_offers')
    .select('id,lead_id,calculation_id,client_id,order_id,offer_number,offer_type,title,short_text,full_text,total_sum,valid_until,status,sent_at,approved_at,rejected_at,created_at,updated_at')
    .eq('id', offerId)
    .single();
  if (response.error || !response.data) throw response.error || new Error('КП не найдено');
  return response.data;
}
async function fetchLead(leadId) {
  if (!leadId) return null;
  const response = await supabaseClient.from('leader_leads').select('id,name,phone,service,status,message,source,created_at').eq('id', leadId).single();
  return response.error ? null : response.data;
}
async function fetchCalculation(calculationId) {
  if (!calculationId) return null;
  const response = await supabaseClient.from('leader_lead_calculations').select('id,title,status,client_total,contractor_cost,profit,margin_percent,public_comment,created_at').eq('id', calculationId).single();
  return response.error ? null : response.data;
}
async function fetchItems(calculationId) {
  if (!calculationId) return [];
  const response = await supabaseClient
    .from('leader_lead_calculation_items')
    .select('id,name,category,item_type,unit,qty,client_price,client_sum,comment,sort_order')
    .eq('calculation_id', calculationId)
    .order('sort_order', { ascending: true })
    .limit(160);
  return response.error ? [] : response.data || [];
}
async function fetchOrder(orderId) {
  if (!orderId) return null;
  const response = await supabaseClient.from('leader_orders').select('id,order_number,project_name,status,deadline,client_total,payment_status,created_at').eq('id', orderId).single();
  return response.error ? null : response.data;
}
async function fetchEvents(offerId) {
  const response = await supabaseClient.from('leader_commercial_offer_events').select('id,event_type,old_status,new_status,comment,created_by_email,created_at').eq('offer_id', offerId).order('created_at', { ascending: false }).limit(20);
  return response.error ? [] : response.data || [];
}

function renderItems(items) {
  if (!items.length) return '<div class="v4-offer-empty">Позиции расчёта не найдены.</div>';
  return items.map((item) => `<div class="v4-offer-row"><div class="v4-offer-row-head"><b>${esc(item.name || 'Позиция')}</b><span>${money(item.client_sum)}</span></div><p>${esc(item.category || '—')} · ${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || '')} · ${money(item.client_price)} / ${esc(item.unit || 'шт')}</p>${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</div>`).join('');
}
function renderEvents(events) {
  if (!events.length) return '<div class="v4-offer-empty">Истории по КП пока нет.</div>';
  return events.map((event) => `<div class="v4-offer-row"><div class="v4-offer-row-head"><b>${esc(event.event_type || 'Событие')}</b><span>${dateTimeRu(event.created_at)}</span></div><p>${event.old_status || event.new_status ? `${esc(event.old_status || '—')} → ${esc(event.new_status || '—')}` : esc(event.comment || 'Без комментария')}</p>${event.created_by_email ? `<small>${esc(event.created_by_email)}</small>` : ''}</div>`).join('');
}
function renderRelation(lead, calculation, order) {
  return `<section class="v4-offer-section"><h3>Связи</h3>${lead ? `<div class="v4-offer-row"><b>Заявка</b><p>${esc(lead.name || lead.phone || lead.service || 'Заявка')} · ${esc(lead.status || '—')}</p><div class="v4-offer-actions-line"><button type="button" data-open-lead="${esc(lead.id)}" data-offer-card-close>Открыть заявку</button></div></div>` : '<div class="v4-offer-empty">Заявка не найдена.</div>'}${calculation ? `<div class="v4-offer-row"><b>Расчёт</b><p>${esc(calculation.title || 'Расчёт')} · ${money(calculation.client_total)} · маржа ${Math.round(Number(calculation.margin_percent || 0))}%</p></div>` : '<div class="v4-offer-empty">Расчёт не найден.</div>'}${order ? `<div class="v4-offer-row"><b>Заказ</b><p>№${esc(order.order_number || shortId(order.id))} · ${esc(order.status || 'Новый')} · ${money(order.client_total)}</p><div class="v4-offer-actions-line"><button type="button" data-open-order="${esc(order.id)}" data-offer-card-close>Открыть заказ</button></div></div>` : '<div class="v4-offer-empty">Заказ по этому КП ещё не создан.</div>'}</section>`;
}
function renderCard({ offer, lead, calculation, items, order, events }) {
  const full = offer.full_text || '';
  const short = offer.short_text || '';
  host().innerHTML = `<div class="v4-offer-modal"><div class="v4-offer-modal-card"><div class="v4-offer-head"><div><p class="v4-kicker">Карточка КП</p><h2>${esc(offer.title || 'Коммерческое предложение')}</h2><p>№${esc(offer.offer_number || shortId(offer.id))} · ${esc(offer.offer_type || 'КП')} · создано ${dateTimeRu(offer.created_at)}</p></div><button type="button" class="v4-offer-close" data-offer-card-close>Закрыть</button></div><div class="v4-offer-grid"><div><span>Статус</span><b>${esc(offer.status || 'Черновик')}</b></div><div><span>Сумма</span><b>${money(offer.total_sum)}</b></div><div><span>Действует до</span><b>${dateRu(offer.valid_until)}</b></div><div><span>Отправлено</span><b>${dateTimeRu(offer.sent_at)}</b></div><div><span>Согласовано</span><b>${dateTimeRu(offer.approved_at)}</b></div><div><span>Заказ</span><b>${order ? 'создан' : 'нет'}</b></div></div><div class="v4-offer-actions-line"><button type="button" data-edit-type="offer" data-edit-id="${esc(offer.id)}">Редактировать КП</button>${lead ? `<button type="button" data-open-lead="${esc(lead.id)}" data-offer-card-close>Открыть заявку</button>` : ''}${order ? `<button type="button" data-open-order="${esc(order.id)}" data-offer-card-close>Открыть заказ</button>` : ''}<button type="button" data-offer-copy="full">Копировать полное</button><button type="button" data-offer-copy="short">Копировать короткое</button></div><div class="v4-offer-columns"><section class="v4-offer-section"><h3>Текст КП</h3><div class="v4-offer-tabs"><button type="button" class="is-active" data-offer-text-tab="full">Полное КП</button><button type="button" data-offer-text-tab="short">Короткое сообщение</button></div><pre class="v4-offer-text" data-offer-full="${esc(full)}" data-offer-short="${esc(short)}">${esc(full || 'Полный текст КП не заполнен.')}</pre></section><div>${renderRelation(lead, calculation, order)}<section class="v4-offer-section" style="margin-top:12px"><h3>История КП</h3>${renderEvents(events)}</section></div></div><section class="v4-offer-section" style="margin-top:12px"><h3>Состав из расчёта</h3>${renderItems(items)}</section></div></div>`;
}

async function openOfferCard(offerId) {
  if (!offerId || busy) return;
  busy = true;
  ensureStyles();
  loading();
  try {
    const offer = await fetchOffer(offerId);
    const [lead, calculation, order, events] = await Promise.all([fetchLead(offer.lead_id), fetchCalculation(offer.calculation_id), fetchOrder(offer.order_id), fetchEvents(offer.id)]);
    const items = await fetchItems(offer.calculation_id);
    renderCard({ offer, lead, calculation, items, order, events });
  } catch (error) {
    errorBox(friendlyError(error));
  } finally {
    busy = false;
  }
}

function offerIdFromCard(card) {
  return card?.querySelector('[data-open-offer-card]')?.dataset.openOfferCard
    || card?.querySelector('[data-edit-type="offer"][data-edit-id]')?.dataset.editId
    || card?.dataset.offerId
    || '';
}

function addButtonsInOffersList() {
  const list = document.getElementById('offersListSectionContent');
  if (!list) return;
  [...list.querySelectorAll('.v4-crm-list-card,.v4-offers-fast-card')].forEach((card) => {
    if (card.querySelector('[data-open-offer-card]')) return;
    const offerId = offerIdFromCard(card);
    if (!offerId) return;
    const actions = card.querySelector('.v4-card-view-actions,.v4-crm-list-actions,.v4-offers-fast-actions') || card;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" data-open-offer-card="${esc(offerId)}">Карточка КП</button>`);
  });
}

function addButtonsInLeadCard() {
  document.querySelectorAll('#offersBox .v4-offer-card').forEach((card) => {
    if (card.querySelector('[data-open-offer-card]')) return;
    const offerId = offerIdFromCard(card);
    if (!offerId) return;
    const actions = card.querySelector('.v4-offer-actions') || card;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" data-open-offer-card="${esc(offerId)}">Карточка КП</button>`);
  });
}

function enhance() {
  const now = Date.now();
  if (now - lastEnhanceAt < 450) return;
  lastEnhanceAt = now;
  addButtonsInOffersList();
  addButtonsInLeadCard();
}

function bind() {
  if (booted) return;
  booted = true;
  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-offer-card-close]');
    if (close) { closeCard(); return; }
    const open = event.target.closest?.('[data-open-offer-card]');
    if (open) { event.preventDefault(); openOfferCard(open.dataset.openOfferCard); return; }
    const copy = event.target.closest?.('[data-offer-copy]');
    if (copy) {
      const text = document.querySelector('.v4-offer-text');
      const value = copy.dataset.offerCopy === 'short' ? text?.dataset.offerShort : text?.dataset.offerFull;
      if (value) navigator.clipboard?.writeText(value);
    }
    const tab = event.target.closest?.('[data-offer-text-tab]');
    if (tab) {
      const box = document.querySelector('.v4-offer-text');
      if (!box) return;
      document.querySelectorAll('[data-offer-text-tab]').forEach((button) => button.classList.toggle('is-active', button === tab));
      box.textContent = tab.dataset.offerTextTab === 'short' ? (box.dataset.offerShort || 'Короткий текст не заполнен.') : (box.dataset.offerFull || 'Полный текст КП не заполнен.');
    }
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(enhance, 250));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(enhance, 250));
  new MutationObserver(() => setTimeout(enhance, 80)).observe(document.body, { childList: true, subtree: true });
  setInterval(enhance, 2000);
}

bind();
