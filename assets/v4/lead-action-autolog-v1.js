import { v4State } from './state.js';
import { addLeadTimelineEvent } from './lead-timeline.js?v=20260617-2';

const recent = new Map();

function leadById(id) {
  return (v4State.leads || []).find((lead) => String(lead.id) === String(id));
}

function currentLeadId() {
  return v4State.currentLead?.id || v4State.route?.leadId || null;
}

function canLog(key) {
  const now = Date.now();
  const prev = recent.get(key) || 0;
  if (now - prev < 8000) return false;
  recent.set(key, now);
  for (const [itemKey, time] of recent.entries()) {
    if (now - time > 60000) recent.delete(itemKey);
  }
  return true;
}

function labelByKind(kind) {
  if (kind === 'today17') return 'сегодня в 17:00';
  if (kind === 'tomorrow') return 'завтра в 10:00';
  if (kind === 'plus3d') return 'через 3 дня';
  if (kind === 'plus7d') return 'через неделю';
  if (kind === 'plus1h') return 'через 1 час';
  if (kind === 'clear') return 'дата очищена';
  return 'дата изменена вручную';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logStatusAfterClick({ leadId, oldStatus, newStatus, body }) {
  await wait(900);
  const lead = v4State.currentLead?.id === leadId ? v4State.currentLead : leadById(leadId);
  if (!lead || lead.status !== newStatus) return;
  const key = `status:${leadId}:${oldStatus || ''}:${newStatus}`;
  if (!canLog(key)) return;
  try {
    await addLeadTimelineEvent({
      leadId,
      eventType: 'Статус',
      oldStatus: oldStatus || null,
      newStatus,
      body: body || `Статус заявки изменён: ${oldStatus || '—'} → ${newStatus}`
    });
  } catch (error) {
    console.warn('CRM v4 autolog status warning:', error);
  }
}

async function logNextContactAfterClick({ leadId, before, kind }) {
  await wait(1100);
  const lead = v4State.currentLead?.id === leadId ? v4State.currentLead : leadById(leadId);
  if (!lead) return;
  const after = lead.next_contact_at || '';
  if (String(before || '') === String(after || '') && kind !== 'clear') return;
  const key = `contact:${leadId}:${kind}:${after || 'clear'}`;
  if (!canLog(key)) return;
  const body = kind === 'clear'
    ? 'Следующий контакт очищен.'
    : `Следующий контакт назначен: ${labelByKind(kind)}${after ? ` (${new Date(after).toLocaleString('ru-RU')})` : ''}.`;
  try {
    await addLeadTimelineEvent({
      leadId,
      eventType: 'Следующий контакт',
      oldStatus: null,
      newStatus: lead.status || null,
      body
    });
  } catch (error) {
    console.warn('CRM v4 autolog contact warning:', error);
  }
}

function bindAutolog() {
  document.addEventListener('click', (event) => {
    const statusButton = event.target.closest?.('button[data-lead-status]');
    if (statusButton) {
      const leadId = currentLeadId();
      const oldStatus = v4State.currentLead?.status || null;
      const newStatus = statusButton.dataset.leadStatus;
      if (leadId && newStatus && oldStatus !== newStatus) {
        logStatusAfterClick({ leadId, oldStatus, newStatus });
      }
      return;
    }

    const nextContactButton = event.target.closest?.('button[data-next-contact]');
    if (nextContactButton) {
      const leadId = currentLeadId();
      const before = v4State.currentLead?.next_contact_at || '';
      const kind = nextContactButton.dataset.nextContact || 'save';
      if (leadId) logNextContactAfterClick({ leadId, before, kind });
      return;
    }

    const listAction = event.target.closest?.('#leadsList button[data-action]');
    if (listAction) {
      const action = listAction.dataset.action;
      if (!['work', 'clarify-contact'].includes(action)) return;
      const card = listAction.closest('.v4-lead-card');
      const leadId = card?.dataset.id;
      const lead = leadById(leadId);
      const oldStatus = lead?.status || null;
      const newStatus = action === 'clarify-contact' ? 'Уточнение деталей' : 'В работе';
      if (leadId && oldStatus !== newStatus) {
        logStatusAfterClick({
          leadId,
          oldStatus,
          newStatus,
          body: action === 'clarify-contact'
            ? 'Заявка без телефона отправлена на уточнение контакта.'
            : 'Заявка переведена в работу из списка заявок.'
        });
      }
      return;
    }

    const quickContact = event.target.closest?.('button[data-contact-quick]');
    if (quickContact) {
      const leadId = quickContact.dataset.contactId;
      const lead = leadById(leadId);
      const before = lead?.next_contact_at || '';
      const kind = quickContact.dataset.contactQuick || 'save';
      if (leadId) logNextContactAfterClick({ leadId, before, kind });
    }
  }, true);
}

bindAutolog();
