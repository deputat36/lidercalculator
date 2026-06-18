import { supabaseClient } from './supabase-client.js';
import { friendlyError, timeout } from './api.js';
import { v4State, setState } from './state.js';
import { setStatus, toast } from './ui.js';
import { loadNeeds } from './needs.js';

let booted = false;
let busy = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const isSiteLead = (lead) => String([lead?.source, lead?.page_url, lead?.message].join(' ')).toLowerCase().includes('сайт') || String(lead?.page_url || '').includes('lider-bsk.ru');
const NEED_FIELDS = 'id,lead_id,client_id,need_type,title,description,structured_data,need_design,need_installation,design_reason,installation_reason,deadline_text,deadline_date,files,status,completeness_score,missing_fields,created_by,updated_by,created_at,updated_at';

function getPayload(lead) {
  const payload = lead?.payload;
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try { return JSON.parse(payload); } catch (_) { return {}; }
}

function asData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function guessNeedType(service = '') {
  const s = String(service).toLowerCase();
  if (s.includes('баннер')) return 'Баннер';
  if (s.includes('вывес')) return 'Вывеска';
  if (s.includes('плён') || s.includes('плен') || s.includes('наклей') || s.includes('стикер')) return 'Пленка / наклейки';
  if (s.includes('таблич')) return 'Табличка';
  if (s.includes('дизайн') || s.includes('макет')) return 'Дизайн';
  if (s.includes('монтаж')) return 'Монтаж';
  if (s.includes('соц') || s.includes('карт') || s.includes('2гис') || s.includes('2gis')) return 'Интернет-реклама';
  return 'Другое';
}

function makeDescription(lead, payload) {
  return [
    lead.message || '',
    payload.business ? `Бизнес / объект: ${payload.business}` : '',
    payload.contact_method ? `Удобная связь: ${payload.contact_method}` : '',
    payload.budget_label ? `Бюджет: ${payload.budget_label}` : '',
    lead.page_url ? `Страница заявки: ${lead.page_url}` : ''
  ].filter(Boolean).join('\n');
}

function isSiteNeed(need) {
  const data = asData(need?.structured_data);
  return data.source === 'site_public_form' || String(need?.title || '').includes('с сайта');
}

function hasSiteNeed() {
  return (v4State.leadNeeds || []).some(isSiteNeed);
}

async function findExistingSiteNeed(leadId) {
  const response = await timeout(
    supabaseClient
      .from('leader_lead_needs')
      .select(NEED_FIELDS)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false }),
    12000,
    'Проверка существующих потребностей не завершилась за 12 секунд'
  );
  if (response.error) throw response.error;
  const needs = response.data || [];
  if (needs.length) setState({ leadNeeds: needs });
  return needs.find(isSiteNeed) || null;
}

function ensureButton() {
  const lead = v4State.currentLead;
  if (!lead || !isSiteLead(lead)) return;
  const box = document.getElementById('leadSiteSummaryBox');
  if (!box || box.querySelector('[data-create-site-need]')) return;
  const actions = box.querySelector('.v4-lead-site-summary-actions') || box;
  const disabled = hasSiteNeed() ? ' disabled title="Потребность из сайта уже создана"' : '';
  actions.insertAdjacentHTML('beforeend', `<button type="button" data-create-site-need${disabled}>Создать потребность из данных сайта</button>`);
}

function markButtonCreated() {
  const button = document.querySelector('[data-create-site-need]');
  if (!button) return;
  button.disabled = true;
  button.title = 'Потребность из сайта уже создана';
  button.textContent = 'Потребность из сайта уже создана';
}

function calculateCompleteness(payload) {
  let score = 25;
  const missing = [];
  if (payload.title) score += 20; else missing.push('Название');
  if (payload.description) score += 15; else missing.push('Описание');
  const data = payload.structured_data || {};
  if (data.quantity) score += 10; else missing.push('Количество / формат');
  if (payload.deadline_text) score += 10; else missing.push('Срок');
  if (payload.need_design || data.mockup) score += 10;
  if (payload.need_installation || data.delivery) score += 10;
  return { score: Math.min(score, 100), missing };
}

function buildNeedPayload() {
  const lead = v4State.currentLead;
  const payload = getPayload(lead);
  const needType = guessNeedType(lead.service || payload.service || '');
  const needDesign = String(payload.mockup || '').toLowerCase().includes('нет') || String(payload.mockup || '').toLowerCase().includes('дизайн') || String(lead.service || '').toLowerCase().includes('дизайн');
  const needInstallation = String(payload.delivery || '').toLowerCase().includes('монтаж');
  const title = `${lead.service || needType || 'Потребность'} с сайта`;
  const structured_data = {
    source: 'site_public_form',
    page_title: payload.page_title || '',
    page_url: lead.page_url || '',
    business: payload.business || '',
    contact_method: payload.contact_method || lead.contact_preference || '',
    quantity: payload.quantity || '',
    deadline: payload.deadline || '',
    mockup: payload.mockup || '',
    delivery: payload.delivery || '',
    budget_label: payload.budget_label || '',
    installation_address: needInstallation ? (lead.city || payload.city || '') : ''
  };
  const result = {
    lead_id: lead.id,
    client_id: lead.converted_client_id || null,
    need_type: needType,
    title,
    description: makeDescription(lead, payload),
    structured_data,
    need_design: needDesign,
    need_installation: needInstallation,
    design_reason: needDesign ? (payload.mockup || 'По данным заявки с сайта нужен макет / дизайн') : null,
    installation_reason: needInstallation ? (payload.delivery || 'По данным заявки с сайта нужен монтаж') : null,
    deadline_text: payload.deadline || null,
    files: [],
    status: 'Черновик',
    created_by: v4State.user?.id || null,
    updated_by: v4State.user?.id || null
  };
  const completeness = calculateCompleteness(result);
  result.completeness_score = completeness.score;
  result.missing_fields = completeness.missing;
  return result;
}

async function createSiteNeed() {
  if (busy) return;
  const lead = v4State.currentLead;
  if (!lead?.id) {
    toast('Сначала откройте заявку');
    return;
  }
  if (hasSiteNeed()) {
    markButtonCreated();
    toast('Потребность из данных сайта уже создана');
    return;
  }
  busy = true;
  try {
    setStatus('Проверяю потребности по заявке...', 'warn');
    const existing = await findExistingSiteNeed(lead.id);
    if (existing) {
      markButtonCreated();
      toast('Потребность из данных сайта уже была создана ранее');
      setStatus('Потребность из сайта уже есть', 'good');
      return;
    }
    setStatus('Создаю потребность из данных сайта...', 'warn');
    const payload = buildNeedPayload();
    const response = await timeout(
      supabaseClient.from('leader_lead_needs').insert(payload).select(NEED_FIELDS).single(),
      12000,
      'Потребность из данных сайта не сохранилась за 12 секунд'
    );
    if (response.error) throw response.error;
    setState({ leadNeeds: [response.data, ...(v4State.leadNeeds || [])] });
    await loadNeeds(lead.id);
    markButtonCreated();
    toast('Потребность создана из данных сайта');
    setStatus('Потребность из сайта создана', 'good');
    setTimeout(ensureButton, 300);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка создания потребности: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}

function boot() {
  if (booted) return;
  booted = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-create-site-need]');
    if (!button) return;
    event.preventDefault();
    createSiteNeed();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => setTimeout(ensureButton, 600));
  document.addEventListener('leader-v4:needs-loaded', () => setTimeout(ensureButton, 200));
  new MutationObserver(() => setTimeout(ensureButton, 120)).observe(document.body, { childList: true, subtree: true });
  setTimeout(ensureButton, 1200);
}

boot();
