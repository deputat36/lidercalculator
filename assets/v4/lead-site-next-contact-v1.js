import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { renderLeads } from './leads.js';
import { setStatus, toast } from './ui.js';

let busy = false;

function tomorrowAt(hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function formatRu(value) {
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return value;
  }
}

async function safeInsert(table, payload) {
  try {
    await supabaseClient.from(table).insert(payload);
  } catch (error) {
    console.warn(`[leader-v4] Не удалось записать событие ${table}`, error);
  }
}

function patchLeadInState(leadId, patch) {
  const leads = (v4State.leads || []).map((lead) => String(lead.id) === String(leadId) ? { ...lead, ...patch } : lead);
  const currentLead = v4State.currentLead && String(v4State.currentLead.id) === String(leadId) ? { ...v4State.currentLead, ...patch } : v4State.currentLead;
  setState({ leads, currentLead });
  renderLeads();
  document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId } }));
}

async function setTomorrowContact() {
  if (busy) return;
  const lead = v4State.currentLead;
  if (!lead?.id) {
    toast('Сначала откройте заявку');
    return;
  }
  busy = true;
  try {
    const next = tomorrowAt(10);
    const status = ['Новая', '', null, undefined].includes(lead.status) ? 'В работе' : lead.status;
    setStatus('Ставлю следующий контакт...', 'warn');
    const response = await timeout(
      supabaseClient
        .from('leader_leads')
        .update({ next_contact_at: next, status, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .select('id,status,next_contact_at,updated_at')
        .single(),
      12000,
      'Следующий контакт не сохранился за 12 секунд'
    );
    if (response.error) throw response.error;
    patchLeadInState(lead.id, response.data || { next_contact_at: next, status });
    await safeInsert('leader_lead_events', {
      lead_id: lead.id,
      event_type: 'Следующий контакт',
      old_status: lead.status || null,
      new_status: status,
      body: `Следующий контакт поставлен на ${formatRu(next)}`,
      created_by: v4State.user?.id || null,
      created_by_email: v4State.user?.email || null
    });
    toast(`Следующий контакт: ${formatRu(next)}`);
    setStatus('Следующий контакт поставлен', 'good');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка следующего контакта: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}

function boot() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-next-contact="tomorrow"]');
    if (!button) return;
    event.preventDefault();
    setTomorrowContact();
  });
}

if (!window.LeaderV4LeadSiteNextContactV1Booted) {
  window.LeaderV4LeadSiteNextContactV1Booted = true;
  boot();
}
