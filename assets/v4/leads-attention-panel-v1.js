import { v4State, setLeadFilters } from './state.js';
import { renderLeads } from './leads.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function isClosed(lead) {
  return ['Спам', 'Создан заказ', 'Отказ', 'Не отвечает', 'Дорого', 'Передумал'].includes(lead.status || 'Новая');
}
function isOverdue(lead) {
  if (!lead.next_contact_at || isClosed(lead)) return false;
  const time = new Date(lead.next_contact_at).getTime();
  return Number.isFinite(time) && time < Date.now();
}
function needContact(lead) {
  return !lead.next_contact_at && !isClosed(lead);
}
function noPhone(lead) {
  return !String(lead.phone || '').trim() && !isClosed(lead);
}
function oldNew(lead) {
  if ((lead.status || 'Новая') !== 'Новая') return false;
  const created = new Date(lead.created_at).getTime();
  return Number.isFinite(created) && Date.now() - created > 1000 * 60 * 60 * 24;
}
function ensureStyles() {
  if (document.getElementById('leadsAttentionPanelV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'leadsAttentionPanelV1Styles';
  style.textContent = `.v4-attention-panel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0 14px}.v4-attention-card{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:12px;text-align:left;box-shadow:0 8px 22px rgba(15,23,42,.05);cursor:pointer}.v4-attention-card span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.v4-attention-card b{display:block;font-size:26px;line-height:1;margin:5px 0;color:#0f172a}.v4-attention-card small{color:#64748b;font-weight:800}.v4-attention-card.is-danger{background:#fff1f2;border-color:#fecdd3}.v4-attention-card.is-danger b{color:#991b1b}.v4-attention-card.is-warn{background:#fffbeb;border-color:#fde68a}.v4-attention-card.is-warn b{color:#92400e}.v4-attention-card.is-blue{background:#eff6ff;border-color:#bfdbfe}.v4-attention-card.is-blue b{color:#1d4ed8}@media(max-width:980px){.v4-attention-panel{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.v4-attention-panel{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}
function counts() {
  const leads = v4State.leads || [];
  return {
    overdue: leads.filter(isOverdue).length,
    noNext: leads.filter(needContact).length,
    noPhone: leads.filter(noPhone).length,
    oldNew: leads.filter(oldNew).length
  };
}
function renderPanel() {
  ensureStyles();
  const section = document.getElementById('leadsSection');
  const filters = section?.querySelector('.v4-filters');
  if (!section || !filters) return;
  let panel = document.getElementById('leadsAttentionPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'leadsAttentionPanel';
    panel.className = 'v4-attention-panel';
    filters.insertAdjacentElement('beforebegin', panel);
  }
  const c = counts();
  panel.innerHTML = `<button type="button" class="v4-attention-card is-danger" data-attention-filter="overdue"><span>Просрочено</span><b>${c.overdue}</b><small>контакты уже прошли</small></button><button type="button" class="v4-attention-card is-warn" data-attention-filter="no_next_contact"><span>Без следующего шага</span><b>${c.noNext}</b><small>нужно поставить дату</small></button><button type="button" class="v4-attention-card is-warn" data-attention-filter="no_phone"><span>Без телефона</span><b>${c.noPhone}</b><small>нужно уточнить контакт</small></button><button type="button" class="v4-attention-card is-blue" data-attention-filter="old_new"><span>Новые больше суток</span><b>${c.oldNew}</b><small>нужно взять в работу</small></button>`;
}
function installClickHandler() {
  if (window.__leadsAttentionPanelClickInstalled) return;
  window.__leadsAttentionPanelClickInstalled = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-attention-filter]');
    if (!button) return;
    const filter = button.dataset.attentionFilter;
    if (filter === 'no_next_contact') setLeadFilters({ status: 'no_next_contact' });
    if (filter === 'no_phone') setLeadFilters({ status: 'no_phone' });
    if (filter === 'overdue' || filter === 'old_new') {
      const list = document.getElementById('leadsList');
      if (list) list.dataset.attentionMode = filter;
      setLeadFilters({ status: 'active' });
    }
    renderLeads();
    setTimeout(filterAttentionList, 30);
  });
}
function filterAttentionList() {
  const list = document.getElementById('leadsList');
  const mode = list?.dataset.attentionMode || '';
  if (!list || !mode) return;
  const allowed = new Set((v4State.leads || []).filter(mode === 'overdue' ? isOverdue : oldNew).map((lead) => lead.id));
  list.querySelectorAll('.v4-lead-card[data-id]').forEach((card) => {
    card.style.display = allowed.has(card.dataset.id) ? '' : 'none';
  });
  const counter = document.getElementById('leadsCounter');
  if (counter) counter.textContent = `Показано по фильтру внимания: ${allowed.size}`;
}
function run() {
  renderPanel();
  installClickHandler();
  filterAttentionList();
}
document.addEventListener('leader-v4:crm-ready', () => setTimeout(run, 500));
document.addEventListener('leader-v4:route-change', () => setTimeout(run, 250));
document.addEventListener('DOMContentLoaded', run);
setInterval(run, 2000);
