import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';

const FIELDS = 'id,lead_id,title,status,total_sum,valid_until,order_id,created_at';
let busy = false;
let loaded = false;
let rows = [];
let warning = '';
let retryTimer = null;
let retryCount = 0;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  const n = Number(value || 0);
  return n ? `${Math.round(n).toLocaleString('ru-RU')} ₽` : '—';
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
  if (text.includes('соглас')) return 'is-good';
  if (text.includes('отклон') || text.includes('устар')) return 'is-danger';
  if (text.includes('отправ') || text.includes('согласован') || text.includes('чернов')) return 'is-warn';
  return '';
}

function workspace() {
  return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body;
}

function ensureStyles() {
  if (document.getElementById('offersFastLoaderV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'offersFastLoaderV1Styles';
  style.textContent = `
    .v4-offers-fast-warning{border:1px solid #fde68a;background:#fffdf3;color:#92400e;border-radius:14px;padding:10px;margin:12px 0;font-weight:800}
    .v4-offers-fast-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 12px}.v4-offers-fast-summary div{border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;padding:12px}.v4-offers-fast-summary span{display:block;color:#1d4ed8;font-size:12px;font-weight:900;text-transform:uppercase}.v4-offers-fast-summary b{display:block;margin-top:5px;font-size:22px;color:#0f172a}
    .v4-offers-fast-list{display:grid;gap:10px}.v4-offers-fast-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;display:grid;gap:8px;box-shadow:0 8px 22px rgba(15,23,42,.05)}.v4-offers-fast-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-offers-fast-head h3{margin:0;font-size:16px}.v4-offers-fast-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px;color:#64748b}.v4-offers-fast-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-offers-fast-actions button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  let section = document.getElementById('offersListSection');
  if (!section) {
    section = document.createElement('section');
    section.id = 'offersListSection';
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = 'offers';
    section.innerHTML = `<div class="v4-section-head"><div><h2>Коммерческие предложения</h2><p>Быстрый список КП: статус, сумма, срок действия и связанная заявка.</p></div><button type="button" class="v4-primary" data-offers-fast-refresh>Обновить</button></div><div id="offersListSectionContent" class="v4-crm-list"><div class="v4-empty">Раздел загрузится при открытии.</div></div>`;
    const catalog = document.getElementById('catalogSection');
    if (catalog?.parentNode) catalog.insertAdjacentElement('afterend', section);
    else workspace().appendChild(section);
  }
  section.dataset.v4ManagedSection = 'offers';
  return section;
}

function host() {
  ensureSection();
  return document.getElementById('offersListSectionContent');
}

function showOffersTab() {
  ensureSection();
  document.body.dataset.v4Tab = 'offers';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'offers'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'offers'; });
}

function render() {
  ensureStyles();
  const box = host();
  if (!box) return;
  const agreed = rows.filter((row) => row.status === 'Согласовано').length;
  const sent = rows.filter((row) => ['Отправлено', 'На согласовании'].includes(row.status || '')).length;
  const total = rows.reduce((sum, row) => sum + Number(row.total_sum || 0), 0);
  const warningHtml = warning ? `<div class="v4-offers-fast-warning">${esc(warning)}. CRM открыта, можно повторить загрузку.</div>` : '';
  box.innerHTML = `${warningHtml}<div class="v4-offers-fast-summary"><div><span>КП</span><b>${rows.length}</b></div><div><span>Отправлено / согласование</span><b>${sent}</b></div><div><span>Согласовано</span><b>${agreed}</b></div><div><span>Сумма КП</span><b>${money(total)}</b></div></div><div class="v4-offers-fast-list">${rows.length ? rows.map((offer) => `<article class="v4-offers-fast-card"><div class="v4-offers-fast-head"><h3>${esc(offer.title || 'Коммерческое предложение')}</h3><span class="v4-crm-badge ${statusClass(offer.status)}">${esc(offer.status || 'Черновик')}</span></div><div class="v4-offers-fast-meta"><span><b>Сумма:</b> ${money(offer.total_sum)}</span><span><b>Действует до:</b> ${dateRu(offer.valid_until)}</span><span><b>Создано:</b> ${dateTimeRu(offer.created_at)}</span><span><b>Заказ:</b> ${offer.order_id ? 'создан' : 'нет'}</span></div><div class="v4-offers-fast-actions">${offer.lead_id ? `<button type="button" data-open-lead="${esc(offer.lead_id)}">Открыть заявку</button>` : ''}<button type="button" data-edit-type="offer" data-edit-id="${esc(offer.id)}">Редактировать КП</button></div></article>`).join('') : '<div class="v4-empty">КП пока нет или список не загрузился. Нажмите «Обновить».</div>'}</div>`;
}

function scheduleRetry() {
  if (retryCount >= 2) return;
  retryCount += 1;
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => {
    if (document.body.dataset.v4Tab === 'offers' && !busy && !loaded) loadOffersFast(true, true);
  }, 5000 * retryCount);
}

async function loadOffersFast(force = false, silent = false) {
  ensureSection();
  ensureStyles();
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true;
  if (!silent) warning = '';
  const box = host();
  if (box && !silent) box.innerHTML = '<div class="v4-empty">Загружаю быстрый список КП...</div>';
  try {
    const response = await supabaseClient.from('leader_commercial_offers').select(FIELDS).order('created_at', { ascending: false }).limit(25);
    if (response.error) throw response.error;
    rows = response.data || [];
    warning = '';
    loaded = true;
    retryCount = 0;
  } catch (error) {
    warning = `КП временно не загрузились: ${friendlyError(error)}`;
    loaded = false;
    scheduleRetry();
  } finally {
    busy = false;
    render();
  }
}

function boot() {
  ensureSection();
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="offers"]');
    if (tab) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showOffersTab();
      loadOffersFast(false);
      return;
    }
    if (event.target.closest?.('[data-offers-fast-refresh],[data-v4-list-refresh="offers"]')) {
      event.preventDefault();
      loaded = false;
      loadOffersFast(true);
    }
  }, true);
}

if (!window.LeaderV4OffersFastLoaderV1Booted) {
  window.LeaderV4OffersFastLoaderV1Booted = true;
  boot();
}

export { loadOffersFast };
