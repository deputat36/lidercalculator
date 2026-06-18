import { v4State } from './state.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function field(label, value) {
  const text = value === null || value === undefined || value === '' ? '—' : value;
  return `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`;
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  const payload = lead?.payload || {};
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk') || payload.form === 'site_public_form_v4';
}

function payloadValue(lead, key) {
  const payload = lead?.payload && typeof lead.payload === 'object' ? lead.payload : {};
  return payload[key] || '';
}

function renderBox(lead) {
  const pageTitle = payloadValue(lead, 'page_title') || lead.page_url || '';
  const business = payloadValue(lead, 'business');
  const contact = lead.contact_preference || payloadValue(lead, 'contact_method');
  const budget = payloadValue(lead, 'budget_label') || lead.budget || lead.estimated_amount || '';
  const width = payloadValue(lead, 'width');
  const height = payloadValue(lead, 'height');
  const quantity = payloadValue(lead, 'quantity');
  const size = [width, height].filter(Boolean).join(' × ');
  const format = [size, quantity].filter(Boolean).join(' · ');
  const rows = [
    field('Страница', pageTitle),
    field('URL', lead.page_url || ''),
    field('Услуга', lead.service || ''),
    field('Бизнес / объект', business),
    field('Город', lead.city || payloadValue(lead, 'city')),
    field('Удобная связь', contact),
    field('Количество / формат', format),
    field('Срок', payloadValue(lead, 'deadline')),
    field('Макет', payloadValue(lead, 'mockup')),
    field('Доставка / монтаж', payloadValue(lead, 'delivery')),
    field('Бюджет', budget)
  ].join('');
  const link = lead.page_url ? `<a href="${esc(lead.page_url)}" target="_blank" rel="noopener">Открыть страницу сайта</a>` : '';
  return `
    <section id="leadSiteSummarySafeBox" class="v4-subcard v4-site-summary-safe">
      <div class="v4-subcard-head">
        <div>
          <h3>Данные заявки с сайта</h3>
          <p>Краткая выжимка из публичной формы. Блок только показывает данные и не выполняет действий автоматически.</p>
        </div>
        ${link}
      </div>
      <dl class="v4-detail-grid">${rows}</dl>
    </section>
  `;
}

function insertBox() {
  const lead = v4State.currentLead;
  if (!lead || !isSiteLead(lead)) return;
  const card = document.querySelector('#leadCardContent .v4-lead-card-view');
  if (!card || document.getElementById('leadSiteSummarySafeBox')) return;
  const actionPanel = card.querySelector('.v4-action-panel');
  const html = renderBox(lead);
  if (actionPanel) actionPanel.insertAdjacentHTML('afterend', html);
  else card.insertAdjacentHTML('afterbegin', html);
}

document.addEventListener('leader-v4:lead-card-rendered', () => {
  setTimeout(insertBox, 80);
  setTimeout(insertBox, 300);
});
