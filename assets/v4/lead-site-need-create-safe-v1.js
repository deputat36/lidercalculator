import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';
import { loadNeeds } from './needs.js';

const NEED_FIELDS = 'id,lead_id,client_id,need_type,title,description,structured_data,need_design,need_installation,design_reason,installation_reason,deadline_text,files,status,completeness_score,missing_fields,created_by,updated_by,created_at,updated_at';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function payload(lead) {
  return lead?.payload && typeof lead.payload === 'object' ? lead.payload : {};
}

function val(lead, key) {
  return payload(lead)[key] || '';
}

function isSiteLead(lead) {
  const source = String(lead?.source || '').toLowerCase();
  const pageUrl = String(lead?.page_url || '').toLowerCase();
  return source.includes('сайт') || source.includes('site') || pageUrl.includes('lider-bsk') || val(lead, 'form') === 'site_public_form_v4';
}

function inferType(lead) {
  const text = `${lead?.service || ''} ${val(lead, 'service') || ''} ${val(lead, 'product') || ''}`.toLowerCase();
  if (text.includes('баннер')) return 'Баннер';
  if (text.includes('вывес')) return 'Вывеска';
  if (text.includes('наклей') || text.includes('плен') || text.includes('плён')) return 'Пленка / наклейки';
  if (text.includes('таблич')) return 'Табличка';
  if (text.includes('полиграф') || text.includes('визит') || text.includes('листов')) return 'Полиграфия';
  if (text.includes('монтаж')) return 'Монтаж';
  if (text.includes('дизайн') || text.includes('макет')) return 'Дизайн';
  return 'Другое';
}

function needPayloadFromLead(lead) {
  const p = payload(lead);
  const width = p.width || p.size_width || '';
  const height = p.height || p.size_height || '';
  const quantity = p.quantity || p.qty || p.count || '';
  const deadline = p.deadline || p.deadline_text || '';
  const material = p.material || p.material_name || '';
  const delivery = p.delivery || p.installation || '';
  const mockup = p.mockup || p.design || '';
  const business = p.business || p.object || '';
  const descriptionParts = [
    lead.message || '',
    business ? `Бизнес / объект: ${business}` : '',
    lead.page_url ? `Страница сайта: ${lead.page_url}` : '',
    p.page_title ? `Заголовок страницы: ${p.page_title}` : '',
    delivery ? `Доставка / монтаж: ${delivery}` : '',
    mockup ? `Макет: ${mockup}` : ''
  ].filter(Boolean);
  const titleParts = [lead.service || p.service || 'Заявка с сайта'];
  if (width || height) titleParts.push([width, height].filter(Boolean).join('×'));
  if (quantity) titleParts.push(quantity);
  const need = {
    lead_id: lead.id,
    client_id: lead.converted_client_id || null,
    need_type: inferType(lead),
    title: titleParts.filter(Boolean).join(' · '),
    description: descriptionParts.join('\n'),
    structured_data: {
      source: 'site_form_safe_import',
      source_lead_id: lead.id,
      page_url: lead.page_url || '',
      page_title: p.page_title || '',
      service: lead.service || p.service || '',
      business,
      city: lead.city || p.city || '',
      contact_method: lead.contact_preference || p.contact_method || '',
      width,
      height,
      quantity,
      print_run: p.print_run || p.format || '',
      material,
      installation_address: p.installation_address || p.address || '',
      delivery,
      mockup,
      budget: lead.budget || lead.estimated_amount || p.budget || p.budget_label || ''
    },
    need_design: String(mockup).toLowerCase().includes('нет') || String(mockup).toLowerCase().includes('нуж'),
    need_installation: String(delivery).toLowerCase().includes('монтаж') || String(delivery).toLowerCase().includes('установ'),
    design_reason: mockup || null,
    installation_reason: delivery || null,
    deadline_text: deadline || null,
    files: [],
    status: 'Черновик',
    completeness_score: 70,
    missing_fields: [],
    created_by: v4State.user?.id || null,
    updated_by: v4State.user?.id || null
  };
  const missing = [];
  if (!need.structured_data.width && !need.structured_data.height && !need.structured_data.quantity && !need.structured_data.print_run) missing.push('Размер / формат / количество');
  if (!need.structured_data.material) missing.push('Материал');
  if (!need.deadline_text) missing.push('Срок');
  if (need.need_installation && !need.structured_data.installation_address) missing.push('Адрес монтажа');
  need.missing_fields = missing;
  need.completeness_score = Math.max(30, 90 - missing.length * 10);
  return need;
}

async function hasDuplicate(leadId) {
  const local = (v4State.leadNeeds || []).some((need) => {
    const data = need.structured_data || {};
    return data.source === 'site_form_safe_import' && String(data.source_lead_id) === String(leadId) && need.status !== 'Архив';
  });
  if (local) return true;
  const response = await timeout(
    supabaseClient.from('leader_lead_needs').select('id,structured_data,status').eq('lead_id', leadId).limit(50),
    12000,
    'Проверка дублей потребности не ответила за 12 секунд'
  );
  if (response.error) throw response.error;
  return (response.data || []).some((need) => {
    const data = need.structured_data || {};
    return data.source === 'site_form_safe_import' && String(data.source_lead_id) === String(leadId) && need.status !== 'Архив';
  });
}

function ensureButton() {
  const lead = v4State.currentLead;
  if (!lead || !isSiteLead(lead) || document.getElementById('createSiteNeedSafeBtn')) return;
  const summary = document.getElementById('leadSiteSummarySafeBox');
  const target = summary?.querySelector('.v4-subcard-head') || document.querySelector('#leadCardContent .v4-action-panel');
  if (!target) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'v4-form-actions';
  wrapper.style.marginTop = '10px';
  wrapper.innerHTML = `<button id="createSiteNeedSafeBtn" type="button" class="v4-primary">Создать потребность из данных сайта</button><span id="createSiteNeedSafeHint" class="v4-muted"></span>`;
  if (summary) summary.appendChild(wrapper);
  else target.insertAdjacentElement('afterend', wrapper);
}

async function createSiteNeed(button) {
  const lead = v4State.currentLead;
  if (!lead?.id || !isSiteLead(lead)) {
    toast('Это не заявка с сайта или карточка ещё не загружена');
    return;
  }
  button.disabled = true;
  const hint = document.getElementById('createSiteNeedSafeHint');
  if (hint) hint.textContent = 'Проверяю дубли...';
  try {
    if (await hasDuplicate(lead.id)) {
      if (hint) hint.textContent = 'Потребность из этой заявки уже создана.';
      toast('Потребность из этой заявки уже есть');
      return;
    }
    if (hint) hint.textContent = 'Создаю потребность...';
    setStatus('Создаю потребность из данных сайта...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_lead_needs').insert(needPayloadFromLead(lead)).select(NEED_FIELDS).single(),
      15000,
      'Потребность из сайта не сохранилась за 15 секунд'
    );
    if (response.error) throw response.error;
    if (hint) hint.textContent = 'Потребность создана.';
    toast('Потребность из сайта создана');
    setStatus('Потребность из данных сайта создана', 'good');
    await loadNeeds(lead.id);
  } catch (error) {
    const message = friendlyError(error);
    if (hint) hint.textContent = message;
    toast(message);
    setStatus(`Ошибка создания потребности из сайта: ${message}`, 'error');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('leader-v4:lead-card-rendered', () => {
  setTimeout(ensureButton, 180);
  setTimeout(ensureButton, 600);
});
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#createSiteNeedSafeBtn');
  if (button) createSiteNeed(button);
});
