import { v4State } from './state.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function leadById(id) {
  return (v4State.leads || []).find((lead) => String(lead.id) === String(id));
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  const payload = lead?.payload && typeof lead.payload === 'object' ? lead.payload : {};
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk') || payload.form === 'site_public_form_v4';
}

function badge(text, className) {
  return `<span class="v4-safe-lead-badge ${esc(className)}">${esc(text)}</span>`;
}

function ensureStyles() {
  if (document.getElementById('leadSafeBadgesV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'leadSafeBadgesV1Styles';
  style.textContent = `
    .v4-safe-lead-badges{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 0}
    .v4-safe-lead-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:900;border:1px solid #cbd5e1;background:#f8fafc;color:#334155}
    .v4-safe-lead-badge.site{background:#dbeafe;border-color:#93c5fd;color:#1d4ed8}
    .v4-safe-lead-badge.no-phone{background:#fee2e2;border-color:#fecaca;color:#991b1b}
    .v4-safe-lead-badge.waiting{background:#fef3c7;border-color:#fcd34d;color:#92400e}
    .v4-safe-lead-card-warning{border-color:#fecaca!important;box-shadow:0 0 0 2px rgba(254,202,202,.55),0 8px 24px rgba(15,23,42,.05)!important}
    .v4-safe-lead-card-site{box-shadow:inset 4px 0 0 #60a5fa,0 8px 24px rgba(15,23,42,.05)!important}
  `;
  document.head.appendChild(style);
}

function decorateLeadList() {
  ensureStyles();
  document.querySelectorAll('#leadsList .v4-lead-card[data-id]').forEach((card) => {
    const lead = leadById(card.dataset.id);
    if (!lead) return;
    const noPhone = !String(lead.phone || '').trim();
    const site = isSiteLead(lead);
    const noNextContact = !lead.next_contact_at && !['Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '');
    card.classList.toggle('v4-safe-lead-card-warning', noPhone);
    card.classList.toggle('v4-safe-lead-card-site', site);
    let box = card.querySelector('.v4-safe-lead-badges');
    if (!box) {
      box = document.createElement('div');
      box.className = 'v4-safe-lead-badges';
      const meta = card.querySelector('.v4-lead-meta') || card.querySelector('.v4-lead-main');
      if (meta) meta.insertAdjacentElement('afterend', box);
      else card.prepend(box);
    }
    const parts = [];
    if (site) parts.push(badge('Сайт', 'site'));
    if (noPhone) parts.push(badge('Нет телефона', 'no-phone'));
    if (noNextContact) parts.push(badge('Нет следующего контакта', 'waiting'));
    box.innerHTML = parts.join('');
    box.hidden = !parts.length;
  });
}

function decorateLeadCard() {
  const lead = v4State.currentLead;
  const card = document.querySelector('#leadCardContent .v4-lead-card-view');
  if (!lead || !card || document.getElementById('leadSafeBadgesCardBox')) return;
  const noPhone = !String(lead.phone || '').trim();
  const site = isSiteLead(lead);
  const noNextContact = !lead.next_contact_at && !['Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '');
  const parts = [];
  if (site) parts.push(badge('Заявка с сайта', 'site'));
  if (noPhone) parts.push(badge('Нет телефона — нужен другой контакт', 'no-phone'));
  if (noNextContact) parts.push(badge('Не назначен следующий контакт', 'waiting'));
  if (!parts.length) return;
  const box = document.createElement('div');
  box.id = 'leadSafeBadgesCardBox';
  box.className = 'v4-safe-lead-badges';
  box.innerHTML = parts.join('');
  const head = card.querySelector('.v4-card-view-head') || card.firstElementChild;
  if (head) head.insertAdjacentElement('afterend', box);
  else card.prepend(box);
}

function scheduleDecorate() {
  setTimeout(decorateLeadList, 80);
  setTimeout(decorateLeadList, 350);
  setTimeout(decorateLeadCard, 120);
  setTimeout(decorateLeadCard, 450);
}

document.addEventListener('leader-v4:crm-ready', scheduleDecorate);
document.addEventListener('leader-v4:lead-card-rendered', scheduleDecorate);
document.addEventListener('leader-v4:route-change', scheduleDecorate);
document.addEventListener('click', (event) => {
  if (event.target.closest?.('#reloadLeadsBtn, #leadStatusFilter, #leadSourceFilter, [data-retry-leads], [data-action="open"]')) scheduleDecorate();
});
document.addEventListener('input', (event) => {
  if (event.target?.id === 'leadSearch') scheduleDecorate();
});
