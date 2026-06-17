import { v4State } from './state.js';

function escText(value) {
  return String(value ?? '').trim();
}

function sameLead(id) {
  return id && (v4State.currentLead?.id === id || v4State.route?.leadId === id);
}

function readableDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function addEventSafe(payload) {
  const fn = window.leaderAddLeadEvent;
  if (typeof fn !== 'function') return;
  fn(payload).catch(() => {});
}

document.addEventListener('click', (event) => {
  const statusButton = event.target.closest('button[data-lead-status]');
  if (statusButton) {
    const leadId = v4State.currentLead?.id || v4State.route?.leadId || null;
    const oldStatus = v4State.currentLead?.status || 'Новая';
    const newStatus = escText(statusButton.dataset.leadStatus);
    if (!leadId || !newStatus || oldStatus === newStatus) return;
    setTimeout(() => {
      if (!sameLead(leadId)) return;
      if ((v4State.currentLead?.status || '') !== newStatus) return;
      addEventSafe({
        leadId,
        eventType: 'Статус',
        oldStatus,
        newStatus,
        body: `Статус заявки изменён: ${oldStatus} → ${newStatus}`
      });
    }, 1400);
    return;
  }

  const nextButton = event.target.closest('button[data-next-contact]');
  if (nextButton) {
    const leadId = v4State.currentLead?.id || v4State.route?.leadId || null;
    const oldDate = v4State.currentLead?.next_contact_at || null;
    const action = escText(nextButton.dataset.nextContact);
    if (!leadId || !action) return;
    setTimeout(() => {
      if (!sameLead(leadId)) return;
      const newDate = v4State.currentLead?.next_contact_at || null;
      if (!newDate || newDate === oldDate) return;
      addEventSafe({
        leadId,
        eventType: 'Следующий контакт',
        body: `Следующий контакт перенесён: ${readableDate(oldDate)} → ${readableDate(newDate)}`
      });
    }, 1400);
  }
}, true);
