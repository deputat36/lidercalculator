import { v4State, setLeadFilters } from './state.js';
import { openLeadRoute } from './router.js';

const CLOSED = new Set(['Создан заказ', 'Отказ', 'Спам', 'Не отвечает', 'Дорого', 'Передумал']);

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function isActive(lead) {
  return !CLOSED.has(lead?.status || 'Новая');
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk');
}

function isOverdue(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function todayEnd() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function contactToday(lead) {
  if (!lead.next_contact_at) return false;
  const time = new Date(lead.next_contact_at).getTime();
  return Number.isFinite(time) && time >= todayStart() && time <= todayEnd();
}

function leadGroups() {
  const leads = (v4State.leads || []).filter(isActive);
  return {
    active: leads,
    newLeads: leads.filter((lead) => (lead.status || 'Новая') === 'Новая'),
    noPhone: leads.filter((lead) => !String(lead.phone || '').trim()),
    noNext: leads.filter((lead) => !lead.next_contact_at),
    overdue: leads.filter((lead) => isOverdue(lead.next_contact_at)),
    today: leads.filter(contactToday),
    site: leads.filter(isSiteLead),
    waiting: leads.filter((lead) => ['КП отправлено', 'Ждём ответ', 'Расчёт подготовлен'].includes(lead.status || ''))
  };
}

function ensureStyles() {
  if (document.getElementById('managerWorkdeskV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'managerWorkdeskV1Styles';
  style.textContent = `
    .v4-workdesk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}.v4-workdesk-stat{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;box-shadow:0 8px 22px rgba(15,23,42,.05)}
    .v4-workdesk-stat span{display:block;color:#64748b;font-size:13px;font-weight:800}.v4-workdesk-stat b{font-size:30px;line-height:1.1}.v4-workdesk-stat.is-danger{border-color:#fecaca;background:#fff7f7}.v4-workdesk-stat.is-warn{border-color:#fde68a;background:#fffdf3}.v4-workdesk-stat.is-good{border-color:#bbf7d0;background:#f0fdf4}
    .v4-workdesk-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.v4-workdesk-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 12px;font-weight:900}.v4-workdesk-actions .v4-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
    .v4-workdesk-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.v4-workdesk-column{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px}.v4-workdesk-column h3{margin:0 0 10px}.v4-workdesk-list{display:grid;gap:10px}.v4-workdesk-item{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:11px;display:grid;gap:6px}.v4-workdesk-item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v4-workdesk-item h4{margin:0;font-size:15px}.v4-workdesk-item small{color:#64748b}.v4-workdesk-item button{justify-self:start;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
    @media(max-width:640px){.v4-workdesk-column{border-radius:14px;padding:12px}.v4-workdesk-actions button,.v4-workdesk-item button{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  ensureStyles();
  let section = document.getElementById('managerWorkdeskSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'managerWorkdeskSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'workdesk';
  section.hidden = true;
  section.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Рабочий стол менеджера</h2>
        <p>Оперативная сводка по активным заявкам: что новое, где нет контакта, что просрочено и к кому вернуться сегодня.</p>
      </div>
      <button type="button" class="v4-primary" data-workdesk-refresh>Обновить рабочий стол</button>
    </div>
    <div id="managerWorkdeskContent"><div class="v4-empty">Заявки загрузятся после входа.</div></div>
  `;
  const firstCard = document.querySelector('#crmWorkspace > .v4-card');
  if (firstCard) firstCard.insertAdjacentElement('afterend', section);
  else (document.getElementById('crmWorkspace') || document.body).prepend(section);
  return section;
}

function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="workdesk"]')) return;
  const anchor = nav.querySelector('[data-v4-tab-button="leads"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'workdesk';
  button.textContent = 'Рабочий стол';
  if (anchor) anchor.insertAdjacentElement('beforebegin', button);
  else nav.appendChild(button);
}

function stat(label, value, type = '') {
  return `<div class="v4-workdesk-stat ${type}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

function item(lead, note = '') {
  return `<article class="v4-workdesk-item" data-workdesk-lead-id="${esc(lead.id)}">
    <div class="v4-workdesk-item-head">
      <h4>${esc(lead.name || 'Без имени')}</h4>
      <small>${esc(lead.status || 'Новая')}</small>
    </div>
    <small>${esc(lead.service || 'Услуга не указана')} · ${esc(lead.source || 'Источник не указан')}</small>
    ${note ? `<small>${esc(note)}</small>` : ''}
    <small>Следующий контакт: ${dateRu(lead.next_contact_at)}</small>
    <button type="button" data-workdesk-open="${esc(lead.id)}">Открыть заявку</button>
  </article>`;
}

function top(list, mapper) {
  return list.slice(0, 5).map(mapper).join('') || '<div class="v4-empty">Нет заявок в этой группе.</div>';
}

function render() {
  ensureSection();
  const content = document.getElementById('managerWorkdeskContent');
  if (!content) return;
  if (v4State.leadsBusy) {
    content.innerHTML = '<div class="v4-empty">Заявки загружаются...</div>';
    return;
  }
  if (!v4State.leadsLoaded) {
    content.innerHTML = '<div class="v4-empty">Сначала загрузите заявки. Обычно это происходит автоматически после входа.</div>';
    return;
  }
  const g = leadGroups();
  content.innerHTML = `
    <div class="v4-workdesk-grid">
      ${stat('Активные заявки', g.active.length)}
      ${stat('Новые', g.newLeads.length, g.newLeads.length ? 'is-good' : '')}
      ${stat('Без телефона', g.noPhone.length, g.noPhone.length ? 'is-danger' : '')}
      ${stat('Без следующего контакта', g.noNext.length, g.noNext.length ? 'is-warn' : '')}
      ${stat('Просрочены', g.overdue.length, g.overdue.length ? 'is-danger' : '')}
      ${stat('Контакты сегодня', g.today.length, g.today.length ? 'is-good' : '')}
      ${stat('Ждут ответ / КП', g.waiting.length, g.waiting.length ? 'is-warn' : '')}
      ${stat('С сайта', g.site.length)}
    </div>
    <div class="v4-workdesk-actions">
      <button type="button" class="v4-primary" data-workdesk-filter="active">Все активные</button>
      <button type="button" data-workdesk-filter="no_phone">Без телефона</button>
      <button type="button" data-workdesk-filter="no_next_contact">Без контакта</button>
      <button type="button" data-workdesk-open-contact-control>Контроль контактов</button>
    </div>
    <div class="v4-workdesk-columns">
      <section class="v4-workdesk-column"><h3>Срочно: нет телефона</h3><div class="v4-workdesk-list">${top(g.noPhone, (lead) => item(lead, 'Нужно найти или уточнить контакт'))}</div></section>
      <section class="v4-workdesk-column"><h3>Просрочены контакты</h3><div class="v4-workdesk-list">${top(g.overdue, (lead) => item(lead, 'Контакт уже просрочен'))}</div></section>
      <section class="v4-workdesk-column"><h3>Вернуться сегодня</h3><div class="v4-workdesk-list">${top(g.today, (lead) => item(lead, 'Запланирован контакт на сегодня'))}</div></section>
      <section class="v4-workdesk-column"><h3>Новые заявки</h3><div class="v4-workdesk-list">${top(g.newLeads, (lead) => item(lead, 'Новая заявка'))}</div></section>
    </div>
  `;
}

function showWorkdesk() {
  ensureSection();
  ensureNav();
  document.body.dataset.v4Tab = 'workdesk';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'workdesk'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'workdesk'; });
  const staticCard = document.querySelector('#crmWorkspace > .v4-card:not(.v4-managed-section)');
  if (staticCard) staticCard.hidden = false;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openLeadsFilter(filter) {
  const select = document.getElementById('leadStatusFilter');
  if (select) select.value = filter;
  const setTab = window.v4SetTab;
  if (typeof setTab === 'function') setTab('leads');
  select?.dispatchEvent(new Event('change', { bubbles: true }));
}

function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => {
    setTimeout(ensureNav, 300);
    setTimeout(render, 800);
  });
  document.addEventListener('leader-v4:tab-opened', () => {
    setTimeout(ensureNav, 150);
    if (document.body.dataset.v4Tab === 'workdesk') render();
  });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="workdesk"]');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      showWorkdesk();
      return;
    }
    const open = event.target.closest?.('[data-workdesk-open]');
    if (open) {
      openLeadRoute(open.dataset.workdeskOpen);
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('card', { noLoad: true });
      return;
    }
    const filter = event.target.closest?.('[data-workdesk-filter]');
    if (filter) openLeadsFilter(filter.dataset.workdeskFilter);
    if (event.target.closest?.('[data-workdesk-open-contact-control]')) {
      document.querySelector('[data-v4-tab-button="contact_control"]')?.click();
    }
    if (event.target.closest?.('[data-workdesk-refresh]')) render();
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
