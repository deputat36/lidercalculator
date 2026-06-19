import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const FINISHED = new Set(['Создан заказ', 'Отказ', 'Спам', 'Не отвечает', 'Дорого', 'Передумал']);
const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function isActiveLead(lead) {
  return !FINISHED.has(lead?.status || 'Новая');
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function isOverdue(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time < Date.now();
}

function contactReasons(lead) {
  const reasons = [];
  if (!String(lead.phone || '').trim()) reasons.push('Нет телефона');
  if (!lead.next_contact_at) reasons.push('Нет следующего контакта');
  else if (isOverdue(lead.next_contact_at)) reasons.push('Просрочен следующий контакт');
  return reasons;
}

function rows() {
  return (v4State.leads || [])
    .filter(isActiveLead)
    .map((lead) => ({ lead, reasons: contactReasons(lead) }))
    .filter((item) => item.reasons.length)
    .sort((a, b) => {
      const ap = !a.lead.phone ? 0 : a.lead.next_contact_at ? 2 : 1;
      const bp = !b.lead.phone ? 0 : b.lead.next_contact_at ? 2 : 1;
      return ap - bp;
    });
}

function nextContactDate(kind) {
  const date = new Date();
  if (kind === 'today17') date.setHours(17, 0, 0, 0);
  if (kind === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  }
  if (kind === 'plus3d') {
    date.setDate(date.getDate() + 3);
    date.setHours(10, 0, 0, 0);
  }
  if (kind === 'plus7d') {
    date.setDate(date.getDate() + 7);
    date.setHours(10, 0, 0, 0);
  }
  return date;
}

function mergeLead(updatedLead) {
  if (!updatedLead?.id) return;
  setState({
    leads: (v4State.leads || []).map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead)),
    currentLead: v4State.currentLead?.id === updatedLead.id ? { ...v4State.currentLead, ...updatedLead } : v4State.currentLead
  });
}

async function saveQuickContact(leadId, kind, button) {
  if (!leadId || !kind) return;
  const currentLead = (v4State.leads || []).find((lead) => String(lead.id) === String(leadId));
  const nextDate = nextContactDate(kind);
  const currentStatus = currentLead?.status || 'Новая';
  const nextStatus = ['КП отправлено', 'Ждём ответ'].includes(currentStatus) ? currentStatus : 'Ждём ответ';
  if (button) button.disabled = true;
  try {
    setStatus('Назначаю следующий контакт...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .update({ next_contact_at: nextDate.toISOString(), status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .select(LEAD_FIELDS)
        .single(),
      16000,
      'Следующий контакт не сохранился за 16 секунд'
    );
    if (response.error) throw response.error;
    mergeLead(response.data);
    render();
    toast('Следующий контакт назначен');
    setStatus('Следующий контакт назначен', 'good');
  } catch (error) {
    const message = friendlyError(error);
    toast(message);
    setStatus(`Ошибка контакта: ${message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function ensureStyles() {
  if (document.getElementById('contactControlV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'contactControlV1Styles';
  style.textContent = `
    .v4-contact-control-list{display:grid;gap:12px}.v4-contact-card{border:1px solid #e2e8f0;background:#fff;border-radius:18px;padding:14px;display:grid;gap:10px;box-shadow:0 8px 24px rgba(15,23,42,.05)}
    .v4-contact-card.is-danger{border-color:#fecaca;background:#fff7f7}.v4-contact-card.is-warn{border-color:#fde68a;background:#fffdf3}
    .v4-contact-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.v4-contact-head h3{margin:0;font-size:17px}.v4-contact-badges{display:flex;gap:6px;flex-wrap:wrap}
    .v4-contact-badge{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:900}.v4-contact-badge.is-danger{background:#fee2e2;border-color:#fecaca;color:#991b1b}.v4-contact-badge.is-warn{background:#fef3c7;border-color:#fcd34d;color:#92400e}
    .v4-contact-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;color:#475569}.v4-contact-actions{display:flex;gap:8px;flex-wrap:wrap}.v4-contact-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:12px;padding:9px 12px;font-weight:900}.v4-contact-actions .v4-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
    .v4-contact-quick{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid #e2e8f0;padding-top:10px}.v4-contact-quick b{color:#334155}.v4-contact-quick button{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;border-radius:12px;padding:8px 10px;font-weight:900}
    @media(max-width:640px){.v4-contact-card{border-radius:14px;padding:12px}.v4-contact-actions button,.v4-contact-quick button{width:100%}.v4-contact-quick{display:grid}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  ensureStyles();
  let section = document.getElementById('contactControlSection');
  if (section) return section;
  section = document.createElement('section');
  section.id = 'contactControlSection';
  section.className = 'v4-card v4-managed-section';
  section.dataset.v4ManagedSection = 'contact_control';
  section.hidden = true;
  section.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Контроль контактов</h2>
        <p>Здесь собраны активные заявки, где нужно дозаполнить телефон, назначить следующий контакт или отработать просроченный контакт.</p>
      </div>
      <button type="button" class="v4-primary" data-contact-control-refresh>Обновить список</button>
    </div>
    <div id="contactControlContent" class="v4-contact-control-list"><div class="v4-empty">Заявки загрузятся после входа.</div></div>
  `;
  const leads = document.getElementById('leadsSection');
  if (leads) leads.insertAdjacentElement('afterend', section);
  else (document.getElementById('crmWorkspace') || document.body).appendChild(section);
  return section;
}

function ensureNav() {
  const nav = document.getElementById('v4LayoutTabs');
  if (!nav || nav.querySelector('[data-v4-tab-button="contact_control"]')) return;
  const leadsButton = nav.querySelector('[data-v4-tab-button="leads"]');
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = 'contact_control';
  button.textContent = 'Контроль контактов';
  if (leadsButton) leadsButton.insertAdjacentElement('afterend', button);
  else nav.appendChild(button);
}

function badge(text) {
  const danger = text === 'Нет телефона';
  return `<span class="v4-contact-badge ${danger ? 'is-danger' : 'is-warn'}">${esc(text)}</span>`;
}

function card({ lead, reasons }) {
  const danger = reasons.includes('Нет телефона');
  return `<article class="v4-contact-card ${danger ? 'is-danger' : 'is-warn'}" data-contact-lead-id="${esc(lead.id)}">
    <div class="v4-contact-head">
      <div>
        <h3>${esc(lead.name || 'Без имени')}</h3>
        <div class="v4-contact-badges">${reasons.map(badge).join('')}</div>
      </div>
      <span class="v4-lead-status">${esc(lead.status || 'Новая')}</span>
    </div>
    <div class="v4-contact-meta">
      <span><b>Телефон:</b> ${esc(lead.phone || '—')}</span>
      <span><b>Источник:</b> ${esc(lead.source || '—')}</span>
      <span><b>Услуга:</b> ${esc(lead.service || '—')}</span>
      <span><b>Следующий контакт:</b> ${dateRu(lead.next_contact_at)}</span>
      <span><b>Создана:</b> ${dateRu(lead.created_at)}</span>
    </div>
    ${lead.message ? `<p class="v4-lead-message">${esc(lead.message)}</p>` : ''}
    <div class="v4-contact-quick">
      <b>Назначить контакт:</b>
      <button type="button" data-contact-quick="today17" data-contact-id="${esc(lead.id)}">Сегодня 17:00</button>
      <button type="button" data-contact-quick="tomorrow" data-contact-id="${esc(lead.id)}">Завтра 10:00</button>
      <button type="button" data-contact-quick="plus3d" data-contact-id="${esc(lead.id)}">Через 3 дня</button>
      <button type="button" data-contact-quick="plus7d" data-contact-id="${esc(lead.id)}">Через неделю</button>
    </div>
    <div class="v4-contact-actions">
      <button type="button" class="v4-primary" data-contact-open="${esc(lead.id)}">Открыть заявку</button>
      ${!lead.phone ? `<button type="button" data-contact-filter-no-phone>Показать все без телефона</button>` : ''}
      ${!lead.next_contact_at ? `<button type="button" data-contact-filter-no-next>Показать все без контакта</button>` : ''}
    </div>
  </article>`;
}

function render() {
  ensureSection();
  const content = document.getElementById('contactControlContent');
  if (!content) return;
  if (v4State.leadsBusy) {
    content.innerHTML = '<div class="v4-empty">Заявки загружаются...</div>';
    return;
  }
  if (!v4State.leadsLoaded) {
    content.innerHTML = '<div class="v4-empty">Сначала загрузите заявки. Обычно это происходит автоматически после входа.</div>';
    return;
  }
  const items = rows();
  if (!items.length) {
    content.innerHTML = '<div class="v4-empty">Проблемных контактов нет: у активных заявок заполнены телефоны и назначены следующие контакты.</div>';
    return;
  }
  const noPhone = items.filter((item) => item.reasons.includes('Нет телефона')).length;
  const noNext = items.filter((item) => item.reasons.includes('Нет следующего контакта')).length;
  const overdue = items.filter((item) => item.reasons.includes('Просрочен следующий контакт')).length;
  content.innerHTML = `<div class="v4-crm-summary"><div><span>Всего в контроле</span><b>${items.length}</b></div><div><span>Без телефона</span><b>${noPhone}</b></div><div><span>Без контакта</span><b>${noNext}</b></div><div><span>Просрочены</span><b>${overdue}</b></div></div>${items.map(card).join('')}`;
}

function showContactControl() {
  ensureSection();
  ensureNav();
  document.body.dataset.v4Tab = 'contact_control';
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === 'contact_control'));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== 'contact_control'; });
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function boot() {
  ensureSection();
  ensureNav();
  document.addEventListener('leader-v4:crm-ready', () => {
    setTimeout(ensureNav, 300);
    setTimeout(render, 700);
  });
  document.addEventListener('leader-v4:tab-opened', () => {
    setTimeout(ensureNav, 150);
    if (document.body.dataset.v4Tab === 'contact_control') render();
  });
  document.addEventListener('click', (event) => {
    const tab = event.target.closest?.('[data-v4-tab-button="contact_control"]');
    if (tab) {
      event.preventDefault();
      event.stopPropagation();
      showContactControl();
      return;
    }
    const quick = event.target.closest?.('[data-contact-quick]');
    if (quick) {
      event.preventDefault();
      saveQuickContact(quick.dataset.contactId, quick.dataset.contactQuick, quick);
      return;
    }
    const open = event.target.closest?.('[data-contact-open]');
    if (open) {
      openLeadRoute(open.dataset.contactOpen);
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('card', { noLoad: true });
      return;
    }
    if (event.target.closest?.('[data-contact-control-refresh]')) render();
    if (event.target.closest?.('[data-contact-filter-no-phone]')) {
      const select = document.getElementById('leadStatusFilter');
      if (select) select.value = 'no_phone';
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('leads');
      select?.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (event.target.closest?.('[data-contact-filter-no-next]')) {
      const select = document.getElementById('leadStatusFilter');
      if (select) select.value = 'no_next_contact';
      const setTab = window.v4SetTab;
      if (typeof setTab === 'function') setTab('leads');
      select?.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, true);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
