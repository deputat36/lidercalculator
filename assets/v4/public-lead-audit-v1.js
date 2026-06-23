import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { setStatus, toast } from './ui.js';

const FIELDS = 'id,created_at,request_id,phone_normalized,source_page_path,page_url,user_agent,referer,utm_source,utm_medium,utm_campaign,result,reason,payload';
let rows = [];
let busy = false;
let loaded = false;
let errorText = '';
let filter = 'all';

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); } }
function short(value, len = 90) { const text = String(value || ''); return text.length > len ? text.slice(0, len - 1) + '…' : text; }
function payloadText(value) {
  if (!value) return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
}
function resultRu(value) {
  const map = { accepted: 'Принято', duplicate: 'Дубль', suspicious: 'Подозрительно', rejected: 'Отклонено', error: 'Ошибка' };
  return map[value] || value || '—';
}
function resultClass(value) {
  if (value === 'accepted') return 'is-good';
  if (value === 'suspicious' || value === 'duplicate') return 'is-warn';
  if (value === 'rejected' || value === 'error') return 'is-danger';
  return '';
}
function ensureStyles() {
  if (document.getElementById('publicLeadAuditV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'publicLeadAuditV1Styles';
  style.textContent = `.v4-audit-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.v4-audit-head h2{margin:0}.v4-audit-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-audit-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-audit-actions .is-active{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.v4-audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}.v4-audit-stat{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px}.v4-audit-stat span{display:block;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}.v4-audit-stat b{display:block;margin-top:4px;font-size:22px}.v4-audit-list{display:grid;gap:10px}.v4-audit-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:12px;display:grid;gap:6px}.v4-audit-card.is-good{border-color:#bbf7d0;background:#f0fdf4}.v4-audit-card.is-warn{border-color:#fde68a;background:#fffdf3}.v4-audit-card.is-danger{border-color:#fecaca;background:#fff7f7}.v4-audit-card h3{margin:0;font-size:15px}.v4-audit-card small{color:#64748b}.v4-audit-badge{display:inline-flex;width:max-content;border-radius:999px;padding:4px 8px;background:#e2e8f0;font-size:12px;font-weight:900}.v4-audit-badge.is-good{background:#dcfce7;color:#166534}.v4-audit-badge.is-warn{background:#fef3c7;color:#92400e}.v4-audit-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-audit-payload{margin-top:4px}.v4-audit-payload summary{cursor:pointer;color:#334155;font-size:12px;font-weight:900}.v4-audit-payload pre{max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:6px 0 0;padding:10px;border-radius:10px;background:#0f172a;color:#e2e8f0;font-size:12px;line-height:1.45}`;
  document.head.appendChild(style);
}
function workspace() { return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body; }
function ensureSection() {
  ensureStyles();
  let section = document.getElementById('publicLeadAuditSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'publicLeadAuditSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'public_lead_audit';
  section.hidden = true;
  section.innerHTML = '<div id="publicLeadAuditContent"><div class="v4-empty">Аудит публичных заявок загрузится при открытии.</div></div>';
  workspace().appendChild(section);
  return section;
}
function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="public_lead_audit"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'public_lead_audit';
  button.textContent = 'Аудит заявок';
  const anchor = nav.querySelector('[data-v4-tab-button="management_dashboard"]') || nav.querySelector('[data-v4-tab-button="leads"]');
  if (anchor) anchor.insertAdjacentElement('afterend', button); else nav.appendChild(button);
}
function filteredRows() { return filter === 'all' ? rows : rows.filter((row) => row.result === filter); }
function stat(label, count) { return `<div class="v4-audit-stat"><span>${esc(label)}</span><b>${count}</b></div>`; }
function card(row) {
  const cls = resultClass(row.result);
  const utm = [row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(' / ') || '—';
  const page = row.source_page_path || row.page_url || '—';
  const payload = payloadText(row.payload);
  return `<article class="v4-audit-card ${cls}"><span class="v4-audit-badge ${cls}">${esc(resultRu(row.result))}</span><h3>${esc(dateRu(row.created_at))}</h3><small>Причина: ${esc(row.reason || '—')}</small><small>Телефон: ${esc(row.phone_normalized || '—')} · request_id: ${esc(short(row.request_id, 44) || '—')}</small><small>Страница: ${esc(short(page, 110))}</small><small>Referer: ${esc(short(row.referer || '—', 120))}</small><small>UTM: ${esc(short(utm, 110))}</small><small>User-Agent: ${esc(short(row.user_agent || '—', 120))}</small><details class="v4-audit-payload"><summary>Технические данные</summary><pre>${esc(short(payload, 1200))}</pre></details></article>`;
}
function render() {
  ensureSection(); ensureNav();
  const box = document.getElementById('publicLeadAuditContent');
  if (!box) return;
  if (busy) { box.innerHTML = '<div class="v4-empty">Загружаю аудит публичных заявок...</div>'; return; }
  if (errorText) { box.innerHTML = `<div class="v4-empty is-error">${esc(errorText)}</div>`; return; }
  if (!loaded) { box.innerHTML = '<div class="v4-empty">Нажмите «Обновить аудит» или откройте раздел ещё раз.</div>'; return; }
  const counts = rows.reduce((acc, row) => { acc[row.result || 'unknown'] = (acc[row.result || 'unknown'] || 0) + 1; return acc; }, {});
  const items = filteredRows();
  box.innerHTML = `<div class="v4-audit-head"><div><p class="v4-kicker">Публичная форма сайта</p><h2>Аудит заявок</h2><p class="v4-muted">Технический контроль отправок формы: принято, подозрительно, отклонено, ошибка. Данные нужны для диагностики и мягкого антиспама.</p></div><button type="button" class="v4-primary" data-public-lead-audit-refresh>Обновить аудит</button></div><div class="v4-audit-grid">${stat('Всего', rows.length)}${stat('Принято', counts.accepted || 0)}${stat('Подозрительно', counts.suspicious || 0)}${stat('Отклонено', counts.rejected || 0)}${stat('Ошибки', counts.error || 0)}</div><div class="v4-audit-actions"><button type="button" class="${filter === 'all' ? 'is-active' : ''}" data-public-lead-audit-filter="all">Все</button><button type="button" class="${filter === 'accepted' ? 'is-active' : ''}" data-public-lead-audit-filter="accepted">Принято</button><button type="button" class="${filter === 'suspicious' ? 'is-active' : ''}" data-public-lead-audit-filter="suspicious">Подозрительно</button><button type="button" class="${filter === 'rejected' ? 'is-active' : ''}" data-public-lead-audit-filter="rejected">Отклонено</button><button type="button" class="${filter === 'error' ? 'is-active' : ''}" data-public-lead-audit-filter="error">Ошибки</button></div><div class="v4-audit-list">${items.length ? items.map(card).join('') : '<div class="v4-empty">Событий в этой группе пока нет.</div>'}</div>`;
}
async function load(force = false) {
  if (busy) return;
  if (loaded && !force) { render(); return; }
  busy = true; errorText = ''; render();
  try {
    setStatus('Загружаю аудит публичных заявок...', 'warn');
    const response = await supabaseClient.from('leader_public_lead_audit').select(FIELDS).order('created_at', { ascending: false }).limit(80);
    if (response.error) throw response.error;
    rows = response.data || [];
    loaded = true;
    setStatus('Аудит публичных заявок загружен', 'good');
  } catch (error) {
    rows = [];
    loaded = true;
    errorText = friendlyError(error);
    toast('Аудит публичных заявок не загрузился');
    setStatus('Аудит публичных заявок не загрузился', 'warn');
  } finally { busy = false; render(); }
}
function show() {
  ensureSection(); ensureNav();
  document.body.dataset.v4Tab = 'public_lead_audit';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'public_lead_audit'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'public_lead_audit'; });
  load(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function boot() {
  ensureSection(); ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(ensureNav, 300));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(ensureNav, 200));
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="public_lead_audit"]');
    if (tab) { event.preventDefault(); event.stopPropagation(); show(); return; }
    if (event.target.closest?.('[data-public-lead-audit-refresh]')) { event.preventDefault(); load(true); return; }
    const f = event.target.closest?.('[data-public-lead-audit-filter]');
    if (f) { event.preventDefault(); filter = f.dataset.publicLeadAuditFilter || 'all'; render(); }
  }, true);
  setTimeout(ensureNav, 800);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
