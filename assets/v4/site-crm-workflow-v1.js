import { v4State, setLeadFilters } from './state.js';
import { renderLeads, loadLeads } from './leads.js';

let booted = false;
let lastPanelSignature = '';
let labelsTimer = null;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const isSiteLead = (lead) => String([lead.source, lead.page_url, lead.message].join(' ')).toLowerCase().includes('сайт') || String(lead.page_url || '').includes('lider-bsk.ru');
const hasNextContact = (lead) => Boolean(lead.next_contact_at);
const hasPhone = (lead) => Boolean(String(lead.phone || '').replace(/\D/g, ''));
const isNew = (lead) => (lead.status || 'Новая') === 'Новая';

function ensureStyles() {
  if (document.getElementById('siteCrmWorkflowV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'siteCrmWorkflowV1Styles';
  style.textContent = `
    .v4-site-crm-panel{border:1px solid #fde68a;background:#fffbeb;border-radius:18px;padding:12px;margin:12px 0;color:#5a3b00}.v4-site-crm-panel h3{margin:0 0 6px;color:#111827}.v4-site-crm-panel p{margin:0 0 10px;font-weight:800}.v4-site-crm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.v4-site-crm-stat{border:1px solid #fef3c7;background:#fff;border-radius:14px;padding:10px}.v4-site-crm-stat span{display:block;font-size:12px;text-transform:uppercase;font-weight:900;color:#92400e}.v4-site-crm-stat b{display:block;font-size:22px;color:#111827}.v4-site-crm-stat.is-danger{border-color:#fecaca;background:#fef2f2}.v4-site-crm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-site-crm-actions button{background:#fff}.v4-site-crm-actions .v4-primary{background:#f6c343;border-color:#f6c343;color:#111827}.v4-site-crm-actions .is-danger{border-color:#fecaca;background:#fef2f2;color:#991b1b}.v4-lead-card.is-site-lead{border-color:#f6c343!important;background:linear-gradient(180deg,#fff,#fffbeb)!important}.v4-lead-card.is-site-lead-no-phone{border-color:#fecaca!important;background:linear-gradient(180deg,#fff,#fef2f2)!important}.v4-lead-card .v4-site-lead-label{display:inline-flex;margin-left:6px;border-radius:999px;background:#f6c343;color:#111827;padding:3px 8px;font-size:11px;font-weight:900}.v4-lead-card .v4-site-lead-label.is-danger{background:#fee2e2;color:#991b1b}.v4-lead-card .v4-site-lead-page{display:block;margin-top:6px;color:#92400e;font-weight:800;font-size:12px;overflow-wrap:anywhere}@media(max-width:720px){.v4-site-crm-actions{display:grid}.v4-site-crm-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function siteStats() {
  const leads = v4State.leads || [];
  const site = leads.filter(isSiteLead);
  return {
    all: leads.length,
    site: site.length,
    siteNew: site.filter(isNew).length,
    siteNoNext: site.filter((lead) => !hasNextContact(lead) && !['Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '')).length,
    siteNoPhone: site.filter((lead) => !hasPhone(lead)).length
  };
}

function panelSignature(stats) {
  return [stats.all, stats.site, stats.siteNew, stats.siteNoNext, stats.siteNoPhone].join('|');
}

function applySiteCardLabels() {
  document.querySelectorAll('.v4-lead-card[data-id]').forEach((card) => {
    const lead = (v4State.leads || []).find((item) => String(item.id) === String(card.dataset.id));
    if (!lead || !isSiteLead(lead)) return;
    card.classList.add('is-site-lead');
    if (!hasPhone(lead)) card.classList.add('is-site-lead-no-phone');
    const title = card.querySelector('.v4-lead-title-row h3');
    if (title && !title.querySelector('.v4-site-lead-label')) {
      title.insertAdjacentHTML('beforeend', `<span class="v4-site-lead-label${hasPhone(lead) ? '' : ' is-danger'}">${hasPhone(lead) ? 'сайт' : 'сайт · нет телефона'}</span>`);
    }
    const main = card.querySelector('.v4-lead-main');
    if (main && lead.page_url && !main.querySelector('.v4-site-lead-page')) main.insertAdjacentHTML('beforeend', `<span class="v4-site-lead-page">Страница: ${esc(lead.page_url)}</span>`);
  });
}

function scheduleLabels() {
  clearTimeout(labelsTimer);
  labelsTimer = setTimeout(applySiteCardLabels, 120);
}

function renderPanel(force = false) {
  ensureStyles();
  const section = document.getElementById('leadsSection');
  const filters = section?.querySelector('.v4-filters');
  if (!section || !filters) return;
  let panel = document.getElementById('siteCrmWorkflowPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'siteCrmWorkflowPanel';
    panel.className = 'v4-site-crm-panel';
    filters.insertAdjacentElement('afterend', panel);
  }
  const s = siteStats();
  const signature = panelSignature(s);
  if (!force && panel.dataset.signature === signature && lastPanelSignature === signature) {
    scheduleLabels();
    return;
  }
  lastPanelSignature = signature;
  panel.dataset.signature = signature;
  panel.innerHTML = `<h3>Сайт ↔ CRM</h3><p>Быстрый контроль заявок с сайта: что пришло, что новое, где нет телефона и где не назначен следующий контакт.</p><div class="v4-site-crm-grid"><div class="v4-site-crm-stat"><span>Всего заявок</span><b>${s.all}</b></div><div class="v4-site-crm-stat"><span>С сайта</span><b>${s.site}</b></div><div class="v4-site-crm-stat"><span>Новые с сайта</span><b>${s.siteNew}</b></div><div class="v4-site-crm-stat"><span>Без контакта</span><b>${s.siteNoNext}</b></div><div class="v4-site-crm-stat ${s.siteNoPhone ? 'is-danger' : ''}"><span>Без телефона</span><b>${s.siteNoPhone}</b></div></div><div class="v4-site-crm-actions"><button type="button" class="v4-primary" data-site-crm-filter="site">Показать заявки с сайта</button><button type="button" data-site-crm-filter="new">Новые с сайта</button><button type="button" data-site-crm-filter="no-next">Без следующего контакта</button><button type="button" class="is-danger" data-site-crm-filter="no-phone">Без телефона</button><button type="button" data-site-crm-filter="reset">Сбросить фильтр</button><button type="button" data-site-crm-refresh>Обновить заявки</button></div>`;
  scheduleLabels();
}

function applyFilter(type) {
  if (type === 'reset') {
    setLeadFilters({ status: 'active', source: 'Все', search: '' });
  }
  if (type === 'site') {
    setLeadFilters({ status: 'active', source: 'Все', search: 'сайт' });
  }
  if (type === 'new') {
    setLeadFilters({ status: 'Новая', source: 'Все', search: 'сайт' });
  }
  if (type === 'no-next' || type === 'no-phone') {
    setLeadFilters({ status: 'active', source: 'Все', search: 'сайт' });
  }
  const search = document.getElementById('leadSearch');
  if (search) search.value = v4State.leadFilters.search || '';
  const status = document.getElementById('leadStatusFilter');
  if (status) status.value = v4State.leadFilters.status || 'active';
  const source = document.getElementById('leadSourceFilter');
  if (source) source.value = v4State.leadFilters.source || 'Все';
  renderLeads();
  setTimeout(() => {
    applySiteCardLabels();
    if (type === 'no-next' || type === 'no-phone') {
      document.querySelectorAll('.v4-lead-card[data-id]').forEach((card) => {
        const lead = (v4State.leads || []).find((item) => String(item.id) === String(card.dataset.id));
        if (type === 'no-next' && lead && hasNextContact(lead)) card.style.display = 'none';
        if (type === 'no-phone' && lead && hasPhone(lead)) card.style.display = 'none';
      });
    }
  }, 80);
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const filter = event.target.closest?.('[data-site-crm-filter]');
    if (filter) {
      event.preventDefault();
      applyFilter(filter.dataset.siteCrmFilter);
      return;
    }
    if (event.target.closest?.('[data-site-crm-refresh]')) {
      event.preventDefault();
      loadLeads({ silent: false }).then(() => setTimeout(() => renderPanel(true), 250));
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(() => renderPanel(true), 800));
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(applySiteCardLabels, 200));
  new MutationObserver(() => scheduleLabels()).observe(document.body, { childList: true, subtree: true });
  setTimeout(() => renderPanel(true), 1200);
}

boot();
