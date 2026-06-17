function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById('leadCardAccordionStyles')) return;
  const style = document.createElement('style');
  style.id = 'leadCardAccordionStyles';
  style.textContent = `
    .v4-lead-card-view{display:grid;gap:12px}
    .v4-lead-main-summary{border:1px solid #dbeafe;background:#eff6ff;border-radius:18px;padding:12px}
    .v4-lead-main-summary .v4-detail-grid{margin:0}
    .v4-lead-accordion{border:1px solid #e2e8f0;border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 8px 22px rgba(15,23,42,.04)}
    .v4-lead-accordion[open]{box-shadow:0 14px 34px rgba(15,23,42,.07)}
    .v4-lead-accordion>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;list-style:none;padding:14px 16px;font-weight:900;color:#0f172a;background:#f8fafc;border-bottom:1px solid transparent}
    .v4-lead-accordion>summary::-webkit-details-marker{display:none}
    .v4-lead-accordion>summary::after{content:'+';display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:#e0f2fe;color:#075985;font-weight:900;flex:0 0 auto}
    .v4-lead-accordion[open]>summary{border-bottom-color:#e2e8f0;background:#f1f5f9}
    .v4-lead-accordion[open]>summary::after{content:'−';background:#dbeafe;color:#1d4ed8}
    .v4-lead-accordion-body{padding:12px}
    .v4-lead-accordion-body>.v4-subcard,.v4-lead-accordion-body>#calculationsBox,.v4-lead-accordion-body>#offersBox,.v4-lead-accordion-body>#standardCalculationsBox,.v4-lead-accordion-body>#advancedCalculationsBox{margin:0!important;border:0!important;box-shadow:none!important;padding:0!important;background:transparent!important}
    .v4-lead-accordion.is-important>summary{background:#ecfeff;color:#155e75}
    .v4-lead-accordion.is-work>summary{background:#f0fdf4;color:#166534}
    .v4-lead-accordion.is-calc>summary{background:#eef2ff;color:#3730a3}
    .v4-lead-accordion.is-offer>summary{background:#fff7ed;color:#9a3412}
    .v4-lead-card-view .v4-action-panel{position:sticky;top:76px;z-index:20;box-shadow:0 12px 28px rgba(15,23,42,.08)}
    @media(max-width:720px){.v4-lead-accordion>summary{padding:12px}.v4-lead-accordion-body{padding:10px}.v4-lead-card-view .v4-action-panel{position:static}}
  `;
  document.head.appendChild(style);
}

function detailsWrapper(title, cssClass = '', open = false) {
  const details = document.createElement('details');
  details.className = `v4-lead-accordion ${cssClass}`.trim();
  details.dataset.leadAccordion = '1';
  if (open) details.open = true;
  details.innerHTML = `<summary>${esc(title)}</summary><div class="v4-lead-accordion-body"></div>`;
  return details;
}

function wrapBlock(block, title, cssClass = '', open = false) {
  if (!block || block.closest('details[data-lead-accordion="1"]')) return;
  const parent = block.parentNode;
  if (!parent) return;
  const details = detailsWrapper(title, cssClass, open);
  parent.insertBefore(details, block);
  details.querySelector('.v4-lead-accordion-body').appendChild(block);
}

function wrapLeadSummary(card) {
  const grid = card.querySelector(':scope > .v4-detail-grid');
  if (!grid || grid.closest('.v4-lead-main-summary')) return;
  const box = document.createElement('section');
  box.className = 'v4-lead-main-summary';
  box.innerHTML = '<h3 style="margin:0 0 10px">Кратко по заявке</h3>';
  grid.insertAdjacentElement('beforebegin', box);
  box.appendChild(grid);
}

function sectionTitle(block) {
  if (!block) return 'Раздел';
  const explicit = block.dataset.accordionTitle;
  if (explicit) return explicit;
  const h = block.querySelector('h2,h3,h4');
  if (h?.textContent?.trim()) return h.textContent.trim();
  if (block.id === 'calculationsBox') return 'Сохранённые расчёты';
  if (block.id === 'standardCalculationsBox') return 'Быстрый типовой расчёт';
  if (block.id === 'advancedCalculationsBox') return 'Нестандартный расчёт';
  if (block.id === 'offersBox') return 'Коммерческие предложения';
  return 'Раздел';
}

function addLeadEditButton() {
  const actions = document.querySelector('#leadCardContent .v4-card-view-actions');
  const leadId = window.LeaderV4CurrentLeadId || document.body.dataset.currentLeadId;
  if (!actions || !leadId || actions.querySelector('[data-edit-type="lead"]')) return;
  const refresh = document.getElementById('refreshLeadBtn');
  const html = `<button type="button" data-edit-type="lead" data-edit-id="${esc(leadId)}">Редактировать заявку</button>`;
  if (refresh) refresh.insertAdjacentHTML('beforebegin', html);
  else actions.insertAdjacentHTML('afterbegin', html);
}

function markCurrentLead(event) {
  const leadId = event?.detail?.leadId;
  if (leadId) {
    window.LeaderV4CurrentLeadId = leadId;
    document.body.dataset.currentLeadId = leadId;
  }
}

function accordionize() {
  ensureStyles();
  const card = document.querySelector('#leadCardContent .v4-lead-card-view');
  if (!card) return;
  wrapLeadSummary(card);
  addLeadEditButton();

  const message = [...card.querySelectorAll(':scope > .v4-subcard')].find((section) => section.textContent.includes('Сообщение клиента'));
  const needs = card.querySelector(':scope > .v4-needs-section');
  const calculations = document.getElementById('calculationsBox');
  const standard = document.getElementById('standardCalculationsBox');
  const advanced = document.getElementById('advancedCalculationsBox');
  const offers = document.getElementById('offersBox');
  const links = [...card.querySelectorAll(':scope > .v4-subcard')].find((section) => section.textContent.includes('Ссылки и источник'));
  const tech = [...card.querySelectorAll(':scope > .v4-subcard')].find((section) => section.textContent.includes('Технические данные формы'));

  wrapBlock(message, 'Сообщение клиента', 'is-important', true);
  wrapBlock(needs, 'Потребности клиента', 'is-work', true);
  wrapBlock(calculations, 'Сохранённые расчёты', 'is-calc', true);
  wrapBlock(standard, 'Быстрый типовой расчёт', 'is-calc', false);
  wrapBlock(advanced, 'Нестандартный расчёт', 'is-calc', false);
  wrapBlock(offers, 'Коммерческие предложения', 'is-offer', false);
  wrapBlock(links, 'Ссылки и источник', '', false);
  wrapBlock(tech, 'Технические данные формы', '', false);

  document.querySelectorAll('details[data-lead-accordion="1"]').forEach((details) => {
    const body = details.querySelector('.v4-lead-accordion-body');
    const child = body?.firstElementChild;
    if (child) details.querySelector('summary').textContent = sectionTitle(child);
  });
}

function scheduleAccordion(event) {
  markCurrentLead(event);
  setTimeout(accordionize, 60);
  setTimeout(accordionize, 260);
  setTimeout(accordionize, 900);
}

document.addEventListener('leader-v4:lead-card-rendered', scheduleAccordion);
document.addEventListener('leader-v4:route-change', scheduleAccordion);
document.addEventListener('leader-v4:crm-ready', scheduleAccordion);
document.addEventListener('DOMContentLoaded', scheduleAccordion);
setInterval(accordionize, 1800);
