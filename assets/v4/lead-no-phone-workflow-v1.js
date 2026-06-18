import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { renderLeads } from './leads.js';
import { toast } from './ui.js';

let booted = false;

const NO_PHONE_STATUS = 'Нет телефона / нужен другой контакт';
const hasPhone = (lead) => Boolean(String(lead?.phone || '').replace(/\D/g, ''));
const isSiteLead = (lead) => String([lead?.source, lead?.page_url, lead?.message].join(' ')).toLowerCase().includes('сайт') || String(lead?.page_url || '').includes('lider-bsk.ru');

function ensureStyles() {
  if (document.getElementById('leadNoPhoneWorkflowV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'leadNoPhoneWorkflowV1Styles';
  style.textContent = `
    .v4-lead-card.is-no-phone-lead{border-color:#fecaca!important;background:linear-gradient(180deg,#fff,#fef2f2)!important}.v4-no-phone-warning{display:block;margin-top:8px;border:1px solid #fecaca;background:#fff;color:#991b1b;border-radius:12px;padding:8px 10px;font-weight:900}.v4-no-phone-action{border-color:#fecaca!important;background:#fef2f2!important;color:#991b1b!important}
  `;
  document.head.appendChild(style);
}

function enhanceCards() {
  ensureStyles();
  document.querySelectorAll('.v4-lead-card[data-id]').forEach((card) => {
    const lead = (v4State.leads || []).find((item) => String(item.id) === String(card.dataset.id));
    if (!lead || hasPhone(lead)) return;
    card.classList.add('is-no-phone-lead');
    const main = card.querySelector('.v4-lead-main');
    if (main && !main.querySelector('.v4-no-phone-warning')) {
      main.insertAdjacentHTML('beforeend', '<span class="v4-no-phone-warning">Нет телефона: проверьте email, сообщение, страницу заявки или другой контакт.</span>');
    }
    const work = card.querySelector('[data-action="work"]');
    if (work) {
      work.textContent = 'Нет телефона';
      work.classList.add('v4-no-phone-action');
      work.title = 'Перевести заявку в отдельный статус для ручного разбора контактов';
    }
  });
}

async function setNoPhoneStatus(leadId) {
  const response = await supabaseClient
    .from('leader_leads')
    .update({ status: NO_PHONE_STATUS, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select('id,status,updated_at')
    .single();
  if (response.error) throw response.error;
  setState({ leads: (v4State.leads || []).map((lead) => String(lead.id) === String(leadId) ? { ...lead, status: NO_PHONE_STATUS, updated_at: response.data?.updated_at || lead.updated_at } : lead) });
  renderLeads();
  setTimeout(enhanceCards, 80);
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('.v4-lead-card.is-no-phone-lead [data-action="work"]');
    if (!button) return;
    const card = button.closest('.v4-lead-card');
    const lead = (v4State.leads || []).find((item) => String(item.id) === String(card?.dataset.id));
    if (!lead || hasPhone(lead)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
      await setNoPhoneStatus(lead.id);
      toast('Заявка переведена в статус: нет телефона');
    } catch (error) {
      toast(friendlyError(error));
    }
  }, true);
  new MutationObserver(enhanceCards).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(enhanceCards, 700));
  setTimeout(enhanceCards, 1000);
}

boot();
