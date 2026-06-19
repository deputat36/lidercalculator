import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';

let booted = false;
let busy = false;

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
function statusClass(status = '') {
  const text = String(status).toLowerCase();
  if (text.includes('соглас') || text.includes('готов') || text.includes('создан') || text.includes('выдан') || text.includes('закры')) return 'is-good';
  if (text.includes('отказ') || text.includes('спам') || text.includes('отмен') || text.includes('проблем')) return 'is-danger';
  if (text.includes('жд') || text.includes('уточ') || text.includes('работ') || text.includes('отправ') || text.includes('производ')) return 'is-warn';
  return '';
}

function ensureStyles() {
  if (document.getElementById('clientCardLightV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'clientCardLightV1Styles';
  style.textContent = `
    .v4-client-modal{position:fixed;inset:0;z-index:690;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:16px}.v4-client-modal-card{width:min(1040px,100%);max-height:92vh;overflow:auto;background:#fff;border:1px solid #dbeafe;border-radius:24px;box-shadow:0 28px 90px rgba(15,23,42,.35);padding:18px}.v4-client-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px}.v4-client-head h2{margin:0}.v4-client-head p{margin:6px 0 0;color:#64748b}.v4-client-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:12px 0}.v4-client-grid div{border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc;padding:12px}.v4-client-grid span{display:block;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}.v4-client-grid b{display:block;margin-top:5px;color:#0f172a}.v4-client-columns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.v4-client-section{border:1px solid #e2e8f0;border-radius:18px;padding:14px;background:#fff}.v4-client-section h3{margin:0 0 10px}.v4-client-item{border:1px solid #e2e8f0;border-radius:14px;padding:10px;margin:8px 0;background:#f8fafc}.v4-client-item-head{display:flex;justify-content:space-between;gap:10px}.v4-client-item-head b{overflow-wrap:anywhere}.v4-client-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.v4-client-badge{display:inline-flex;border-radius:999px;background:#e0f2fe;color:#075985;padding:4px 8px;font-size:12px;font-weight:900;white-space:nowrap}.v4-client-badge.is-good{background:#dcfce7;color:#166534}.v4-client-badge.is-warn{background:#fef3c7;color:#92400e}.v4-client-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-client-empty{border:1px dashed #cbd5e1;border-radius:14px;padding:12px;color:#64748b;background:#f8fafc}.v4-client-close{white-space:nowrap}
    @media(max-width:820px){.v4-client-modal-card{padding:12px;border-radius:18px}.v4-client-head,.v4-client-columns{display:grid;grid-template-columns:1fr}.v4-client-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}
function host() {
  let element = document.getElementById('clientCardV1');
  if (!element) {
    element = document.createElement('div');
    element.id = 'clientCardV1';
    document.body.appendChild(element);
  }
  return element;
}
function closeCard() {
  host().innerHTML = '';
  busy = false;
}
function loading() {
  host().innerHTML = `<div class="v4-client-modal"><div class="v4-client-modal-card"><div class="v4-client-head"><div><h2>Карточка клиента</h2><p>Загружаю данные клиента...</p></div><button type="button" class="v4-client-close" data-client-card-close>Закрыть</button></div><div class="v4-client-empty">Загрузка...</div></div></div>`;
}
function errorBox(text) {
  host().innerHTML = `<div class="v4-client-modal"><div class="v4-client-modal-card"><div class="v4-client-head"><div><h2>Карточка клиента</h2><p>Не удалось загрузить данные</p></div><button type="button" class="v4-client-close" data-client-card-close>Закрыть</button></div><div class="v4-client-empty">${esc(text)}</div></div></div>`;
}

async function fetchLead(leadId) {
  const response = await supabaseClient.from('leader_leads').select('id,name,phone,source,service,status,budget,estimated_amount,message,city,created_at,next_contact_at,converted_client_id').eq('id', leadId).single();
  if (response.error || !response.data) throw response.error || new Error('Заявка не найдена');
  return response.data;
}
async function fetchLeadsForClient(baseLead) {
  let response = null;
  const fields = 'id,name,phone,source,service,status,budget,estimated_amount,message,city,created_at,next_contact_at,converted_client_id';
  if (baseLead.phone) response = await supabaseClient.from('leader_leads').select(fields).eq('phone', baseLead.phone).order('created_at', { ascending: false }).limit(40);
  if (!response?.data?.length && baseLead.name) response = await supabaseClient.from('leader_leads').select(fields).eq('name', baseLead.name).order('created_at', { ascending: false }).limit(40);
  return response?.data?.length ? response.data : [baseLead];
}
async function fetchOrdersForClient(baseLead, leads) {
  const fields = 'id,order_number,lead_id,client_id,project_name,status,deadline,client_name,client_phone,client_total,payment_status,created_at';
  const clientIds = [...new Set(leads.map((lead) => lead.converted_client_id).filter(Boolean))];
  const leadIds = [...new Set(leads.map((lead) => lead.id).filter(Boolean))];
  const buckets = [];
  if (clientIds.length) {
    const response = await supabaseClient.from('leader_orders').select(fields).in('client_id', clientIds).order('created_at', { ascending: false }).limit(50);
    if (!response.error && response.data?.length) buckets.push(...response.data);
  }
  if (leadIds.length) {
    const response = await supabaseClient.from('leader_orders').select(fields).in('lead_id', leadIds).order('created_at', { ascending: false }).limit(50);
    if (!response.error && response.data?.length) buckets.push(...response.data);
  }
  if (baseLead.phone) {
    const response = await supabaseClient.from('leader_orders').select(fields).eq('client_phone', baseLead.phone).order('created_at', { ascending: false }).limit(40);
    if (!response.error && response.data?.length) buckets.push(...response.data);
  }
  const map = new Map();
  buckets.forEach((order) => map.set(order.id, order));
  return [...map.values()].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}
async function fetchOffersForClient(leads) {
  const ids = [...new Set(leads.map((lead) => lead.id).filter(Boolean))].slice(0, 40);
  if (!ids.length) return [];
  const response = await supabaseClient.from('leader_commercial_offers').select('id,lead_id,calculation_id,order_id,title,status,total_sum,valid_until,created_at').in('lead_id', ids).order('created_at', { ascending: false }).limit(80);
  return response.error ? [] : response.data || [];
}

function renderLeadItem(lead) {
  return `<div class="v4-client-item"><div class="v4-client-item-head"><b>${esc(lead.service || lead.message || 'Заявка')}</b><span class="v4-client-badge ${statusClass(lead.status)}">${esc(lead.status || 'Новая')}</span></div><p>${esc(lead.message || 'Комментарий не заполнен')}</p><small>${dateTimeRu(lead.created_at)} · ${money(lead.budget || lead.estimated_amount)}</small><div class="v4-client-actions"><button type="button" data-open-lead="${esc(lead.id)}" data-client-card-close>Открыть заявку</button><button type="button" data-edit-type="lead" data-edit-id="${esc(lead.id)}">Редактировать</button></div></div>`;
}
function renderOrderItem(order) {
  return `<div class="v4-client-item"><div class="v4-client-item-head"><b>№${esc(order.order_number || String(order.id).slice(0, 8))} — ${esc(order.project_name || 'Заказ')}</b><span class="v4-client-badge ${statusClass(order.status)}">${esc(order.status || 'Новый')}</span></div><p>Срок: ${dateRu(order.deadline)} · Оплата: ${esc(order.payment_status || '—')}</p><small>${money(order.client_total)} · ${dateTimeRu(order.created_at)}</small><div class="v4-client-actions"><button type="button" data-open-order="${esc(order.id)}" data-client-card-close>Открыть заказ</button><button type="button" data-edit-type="order" data-edit-id="${esc(order.id)}">Редактировать</button></div></div>`;
}
function renderOfferItem(offer) {
  return `<div class="v4-client-item"><div class="v4-client-item-head"><b>${esc(offer.title || 'Коммерческое предложение')}</b><span class="v4-client-badge ${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span></div><p>Действует до: ${dateRu(offer.valid_until)} · Заказ: ${offer.order_id ? 'создан' : 'нет'}</p><small>${money(offer.total_sum)} · ${dateTimeRu(offer.created_at)}</small><div class="v4-client-actions"><button type="button" data-open-offer-card="${esc(offer.id)}">Открыть КП</button><button type="button" data-edit-type="offer" data-edit-id="${esc(offer.id)}">Редактировать КП</button>${offer.lead_id ? `<button type="button" data-open-lead="${esc(offer.lead_id)}" data-client-card-close>Открыть заявку</button>` : ''}</div></div>`;
}
function renderCard(baseLead, leads, orders, offers) {
  const totalOrdersSum = orders.reduce((sum, order) => sum + Number(order.client_total || 0), 0);
  const totalLeadBudget = leads.reduce((sum, lead) => sum + Number(lead.budget || lead.estimated_amount || 0), 0);
  const name = baseLead.name || 'Без имени';
  const phone = baseLead.phone || 'телефон не указан';
  host().innerHTML = `<div class="v4-client-modal"><div class="v4-client-modal-card"><div class="v4-client-head"><div><p class="v4-kicker">Карточка клиента</p><h2>${esc(name)}</h2><p>${esc(phone)} · ${esc(baseLead.city || 'город не указан')} · источник: ${esc(baseLead.source || '—')}</p></div><button type="button" class="v4-client-close" data-client-card-close>Закрыть</button></div><div class="v4-client-grid"><div><span>Заявок</span><b>${leads.length}</b></div><div><span>КП</span><b>${offers.length}</b></div><div><span>Заказов</span><b>${orders.length}</b></div><div><span>Сумма заказов</span><b>${money(totalOrdersSum)}</b></div><div><span>Бюджеты заявок</span><b>${money(totalLeadBudget)}</b></div><div><span>Последний контакт</span><b>${dateRu(baseLead.next_contact_at || baseLead.created_at)}</b></div></div><div class="v4-client-actions"><button type="button" data-edit-type="client" data-edit-id="${esc(baseLead.id)}" data-client-id="${esc(baseLead.converted_client_id || '')}">Редактировать клиента</button><button type="button" data-open-lead="${esc(baseLead.id)}" data-client-card-close>Открыть последнюю заявку</button></div><div class="v4-client-columns"><section class="v4-client-section"><h3>Заявки клиента</h3>${leads.length ? leads.map(renderLeadItem).join('') : '<div class="v4-client-empty">Заявок нет.</div>'}</section><div><section class="v4-client-section"><h3>Заказы</h3>${orders.length ? orders.map(renderOrderItem).join('') : '<div class="v4-client-empty">Заказов пока нет.</div>'}</section><section class="v4-client-section" style="margin-top:12px"><h3>Коммерческие предложения</h3>${offers.length ? offers.map(renderOfferItem).join('') : '<div class="v4-client-empty">КП пока нет.</div>'}</section></div></div></div></div>`;
}

async function openClientCard(leadId) {
  if (!leadId || busy) return;
  busy = true;
  ensureStyles();
  loading();
  try {
    const baseLead = await fetchLead(leadId);
    const leads = await fetchLeadsForClient(baseLead);
    const [orders, offers] = await Promise.all([fetchOrdersForClient(baseLead, leads), fetchOffersForClient(leads)]);
    renderCard(baseLead, leads, orders, offers);
  } catch (error) {
    errorBox(friendlyError(error));
  } finally {
    busy = false;
  }
}

function addClientButtons() {
  const clients = document.getElementById('clientsSectionContent');
  if (!clients) return;
  clients.querySelectorAll('.v4-crm-list-card').forEach((card) => {
    const leadButton = card.querySelector('[data-open-lead]');
    const leadId = leadButton?.dataset.openLead;
    const actions = card.querySelector('.v4-crm-actions');
    if (leadId && actions && !actions.querySelector('[data-open-client-card]')) {
      actions.insertAdjacentHTML('afterbegin', `<button type="button" class="v4-primary" data-open-client-card="${esc(leadId)}">Карточка клиента</button>`);
    }
  });
}
function scheduleEnhance() {
  setTimeout(addClientButtons, 120);
  setTimeout(addClientButtons, 650);
}
function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const open = event.target.closest?.('[data-open-client-card]');
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      openClientCard(open.dataset.openClientCard);
      return;
    }
    if (event.target.closest?.('[data-client-card-close]')) closeCard();
  }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
  document.addEventListener('leader-v4:crm-ready', scheduleEnhance);
  document.addEventListener('leader-v4:route-change', scheduleEnhance);
  document.addEventListener('click', (event) => { if (event.target.closest?.('[data-v4-list-refresh="clients"],[data-v4-tab-button="clients"]')) scheduleEnhance(); });
  scheduleEnhance();
}
boot();
