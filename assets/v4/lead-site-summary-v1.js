import { v4State } from './state.js';

let booted = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const isSiteLead = (lead) => String([lead?.source, lead?.page_url, lead?.message].join(' ')).toLowerCase().includes('сайт') || String(lead?.page_url || '').includes('lider-bsk.ru');

function ensureStyles() {
  if (document.getElementById('leadSiteSummaryV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'leadSiteSummaryV1Styles';
  style.textContent = `
    .v4-lead-site-summary{border:1px solid #fde68a;background:#fffbeb;border-radius:18px;padding:14px;margin:12px 0}.v4-lead-site-summary h3{margin:0 0 8px;color:#111827}.v4-lead-site-summary p{margin:0 0 10px;color:#92400e;font-weight:800}.v4-lead-site-summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.v4-lead-site-summary-grid div{border:1px solid #fef3c7;background:#fff;border-radius:14px;padding:10px}.v4-lead-site-summary-grid dt{font-size:12px;text-transform:uppercase;font-weight:900;color:#92400e}.v4-lead-site-summary-grid dd{margin:4px 0 0;color:#111827;font-weight:800}.v4-lead-site-summary-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-lead-site-summary-actions a,.v4-lead-site-summary-actions button{border:1px solid #f6c343;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900;color:#111827;text-decoration:none}@media(max-width:720px){.v4-lead-site-summary-actions{display:grid}.v4-lead-site-summary-actions a,.v4-lead-site-summary-actions button{width:100%;text-align:center}}
  `;
  document.head.appendChild(style);
}

function payloadValue(payload, keys) {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of keys) {
    if (payload[key]) return payload[key];
  }
  return '';
}

function row(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value || '—')}</dd></div>`;
}

function renderSummary(lead) {
  const payload = lead.payload || {};
  const pageTitle = payloadValue(payload, ['page_title']) || '';
  const business = payloadValue(payload, ['business']) || '';
  const contact = payloadValue(payload, ['contact_method']) || lead.contact_preference || '';
  const quantity = payloadValue(payload, ['quantity']) || '';
  const deadline = payloadValue(payload, ['deadline']) || '';
  const mockup = payloadValue(payload, ['mockup']) || '';
  const delivery = payloadValue(payload, ['delivery']) || '';
  const budget = payloadValue(payload, ['budget_label']) || '';
  const city = payloadValue(payload, ['city']) || lead.city || '';
  const service = lead.service || '';
  return `<section id="leadSiteSummaryBox" class="v4-lead-site-summary"><h3>Данные с сайта для менеджера</h3><p>Используйте этот блок как чек-лист первого контакта: что клиент выбрал на сайте и что нужно уточнить.</p><dl class="v4-lead-site-summary-grid">${row('Страница', pageTitle || lead.page_url || '—')}${row('Услуга', service)}${row('Бизнес / объект', business)}${row('Город', city)}${row('Связь', contact)}${row('Количество / формат', quantity)}${row('Срок', deadline)}${row('Макет', mockup)}${row('Доставка / монтаж', delivery)}${row('Бюджет', budget)}</dl><div class="v4-lead-site-summary-actions">${lead.page_url ? `<a href="${esc(lead.page_url)}" target="_blank" rel="noopener">Открыть страницу заявки</a>` : ''}<button type="button" data-next-contact="tomorrow">Поставить контакт на завтра</button></div></section>`;
}

function insertSummary() {
  ensureStyles();
  const lead = v4State.currentLead;
  if (!lead || !isSiteLead(lead)) return;
  const card = document.querySelector('.v4-lead-card-view');
  if (!card || document.getElementById('leadSiteSummaryBox')) return;
  const message = [...card.querySelectorAll('.v4-subcard h3')].find((h3) => (h3.textContent || '').includes('Сообщение клиента'))?.closest('.v4-subcard');
  if (message) message.insertAdjacentHTML('afterend', renderSummary(lead));
  else card.insertAdjacentHTML('beforeend', renderSummary(lead));
}

function boot() {
  if (booted) return;
  booted = true;
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(insertSummary, 150));
  new MutationObserver(() => setTimeout(insertSummary, 80)).observe(document.body, { childList: true, subtree: true });
  setTimeout(insertSummary, 1000);
}

boot();
