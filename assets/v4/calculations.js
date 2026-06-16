import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';
const QUICK_TEMPLATES = [
  { key: 'banner', label: 'Баннер', name: 'Баннер, печать и обработка', unit: 'м²', qty: 1, comment: 'Печать, обработка края, люверсы по необходимости' },
  { key: 'sign', label: 'Вывеска', name: 'Вывеска под ключ', unit: 'комплект', qty: 1, comment: 'Материалы, изготовление, подготовка к монтажу' },
  { key: 'film', label: 'Плёнка', name: 'Плёнка / наклейки', unit: 'м²', qty: 1, comment: 'Печать, резка или подготовка макета' },
  { key: 'design', label: 'Дизайн', name: 'Разработка макета', unit: 'услуга', qty: 1, comment: 'Подготовка макета к производству' },
  { key: 'install', label: 'Монтаж', name: 'Монтажные работы', unit: 'услуга', qty: 1, comment: 'Выезд, установка, крепёж по ситуации' }
];
let draftItems = [];
let saveBusy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function num(id) {
  return Number(String(byId(id)?.value || '').replace(',', '.')) || 0;
}

function val(id) {
  return byId(id)?.value?.trim() || '';
}

function calcItem(raw, index) {
  const qty = Number(raw.qty || 0);
  const contractorPrice = Number(raw.contractor_price || 0);
  const clientPrice = Number(raw.client_price || 0);
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  const markupPercent = contractorSum > 0 ? ((clientSum - contractorSum) / contractorSum) * 100 : 0;
  const marginPercent = clientSum > 0 ? (profit / clientSum) * 100 : 0;
  return {
    category: raw.category || 'Ручная позиция',
    item_type: raw.item_type || 'Услуга',
    name: raw.name || `Позиция ${index + 1}`,
    unit: raw.unit || 'шт',
    qty,
    contractor_price: contractorPrice,
    contractor_sum: contractorSum,
    markup_percent: markupPercent,
    client_price: clientPrice,
    client_sum: clientSum,
    profit,
    margin_percent: marginPercent,
    comment: raw.comment || '',
    data: {},
    sort_order: index + 1
  };
}

function totals(items = draftItems) {
  const calculated = items.map(calcItem);
  const contractor = calculated.reduce((sum, item) => sum + item.contractor_sum, 0);
  const client = calculated.reduce((sum, item) => sum + item.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!calculated.length) warnings.push('Нет позиций расчёта');
  if (client <= 0) warnings.push('Сумма клиенту равна 0');
  if (contractor <= 0) warnings.push('Себестоимость равна 0');
  if (profit < 0) warnings.push('Расчёт убыточный');
  if (client > 0 && margin < 20) warnings.push('Маржа ниже 20%');
  return {
    items: calculated,
    contractor_cost: contractor,
    client_total: client,
    profit,
    margin_percent: margin,
    warnings,
    warning_level: warnings.some((w) => w.includes('убыточный') || w.includes('равна 0')) ? 'critical' : warnings.length ? 'warning' : 'ok'
  };
}

function needOptions(selectedValue = '') {
  const options = [`<option value="" ${selectedValue ? '' : 'selected'}>Общий расчёт по заявке</option>`];
  (v4State.leadNeeds || []).filter((need) => need.status !== 'Архив').forEach((need) => {
    options.push(`<option value="${esc(need.id)}" ${need.id === selectedValue ? 'selected' : ''}>${esc(need.title || need.need_type || 'Потребность')}</option>`);
  });
  return options.join('');
}

function refreshNeedSelect() {
  const select = byId('calcNeedId');
  if (!select) return;
  const current = select.value || '';
  select.innerHTML = needOptions(current);
  if (current && ![...select.options].some((option) => option.value === current)) {
    select.value = '';
  }
}

function renderCalcCard(calc) {
  const levelClass = calc.warning_level === 'critical' ? 'is-error' : calc.warning_level === 'warning' ? 'is-warn' : 'is-good';
  const warnings = Array.isArray(calc.warnings) ? calc.warnings : [];
  return `
    <article class="v4-calc-card">
      <div>
        <div class="v4-calc-title-row">
          <h4>${esc(calc.title || 'Расчёт')}</h4>
          <span class="${levelClass}">${esc(calc.status || 'Черновик')}</span>
        </div>
        <div class="v4-calc-totals">
          <span><b>Клиенту:</b> ${money(calc.client_total)}</span>
          <span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span>
          <span><b>Прибыль:</b> ${money(calc.profit)}</span>
          <span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span>
        </div>
        ${warnings.length ? `<div class="v4-calc-warnings">${warnings.map(esc).join(', ')}</div>` : ''}
      </div>
    </article>
  `;
}

function currentDraftItem() {
  return calcItem({
    name: val('calcItemName') || 'Новая позиция',
    unit: val('calcItemUnit') || 'шт',
    qty: num('calcItemQty') || 1,
    contractor_price: num('calcItemCost'),
    client_price: num('calcItemClient'),
    comment: val('calcItemComment')
  }, 0);
}

function renderItemPreview() {
  const preview = byId('calcItemPreview');
  if (!preview) return;
  const item = currentDraftItem();
  const className = item.client_sum <= 0 || item.contractor_sum <= 0 || item.profit < 0 ? ' is-error' : item.margin_percent < 20 ? ' is-warn' : ' is-good';
  const hint = item.client_sum <= 0
    ? 'Укажите цену клиенту.'
    : item.contractor_sum <= 0
      ? 'Проверьте себестоимость, чтобы видеть реальную прибыль.'
      : item.profit < 0
        ? 'Позиция убыточная.'
        : item.margin_percent < 20
          ? 'Маржа ниже 20%. Лучше пересмотреть цену.'
          : 'Позиция выглядит нормально.';
  preview.className = `v4-calc-live${className}`;
  preview.innerHTML = `
    <span><b>Сумма клиенту:</b> ${money(item.client_sum)}</span>
    <span><b>Себестоимость:</b> ${money(item.contractor_sum)}</span>
    <span><b>Прибыль:</b> ${money(item.profit)}</span>
    <span><b>Маржа:</b> ${Math.round(item.margin_percent)}%</span>
    <em>${esc(hint)}</em>
  `;
}

function renderDraftItems() {
  const list = byId('calcDraftItems');
  const totalBox = byId('calcDraftTotals');
  const guideBox = byId('calcDraftGuide');
  if (!list || !totalBox) return;
  const result = totals();
  list.innerHTML = draftItems.length ? result.items.map((item, index) => `
    <tr>
      <td>${esc(item.name)}${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</td>
      <td>${esc(item.unit)}</td>
      <td>${item.qty}</td>
      <td>${money(item.contractor_price)}</td>
      <td>${money(item.client_price)}</td>
      <td>${money(item.client_sum)}</td>
      <td><button type="button" data-action="remove-calc-item" data-index="${index}">×</button></td>
    </tr>
  `).join('') : '<tr><td colspan="7">Позиции пока не добавлены. Выберите быстрый шаблон или заполните позицию вручную.</td></tr>';
  const levelClass = result.warning_level === 'critical' ? ' is-error' : result.warning_level === 'warning' ? ' is-warn' : ' is-good';
  totalBox.className = `v4-calc-totals v4-calc-total-panel${levelClass}`;
  totalBox.innerHTML = `
    <span><b>Клиенту:</b> ${money(result.client_total)}</span>
    <span><b>Себестоимость:</b> ${money(result.contractor_cost)}</span>
    <span><b>Прибыль:</b> ${money(result.profit)}</span>
    <span><b>Маржа:</b> ${Math.round(result.margin_percent)}%</span>
  `;
  if (guideBox) {
    guideBox.innerHTML = result.warnings.length
      ? `<div class="v4-calc-warnings">Перед сохранением проверьте: ${result.warnings.map(esc).join(', ')}</div>`
      : '<div class="v4-calc-ok">Расчёт можно сохранять. После этого ниже появится возможность сформировать КП.</div>';
  }
  renderItemPreview();
}

function renderTemplateButtons() {
  return QUICK_TEMPLATES.map((template) => `<button type="button" data-calc-template="${esc(template.key)}">${esc(template.label)}</button>`).join('');
}

function renderCalcForm() {
  return `
    <div class="v4-calc-form">
      <div class="v4-calc-wizard-head">
        <div>
          <h4>Новый расчёт</h4>
          <p>Заполните одну позицию, добавьте её в таблицу, проверьте итог и сохраните расчёт. Себестоимость клиент не увидит — она нужна только для контроля прибыли.</p>
        </div>
        <div class="v4-calc-steps"><span>1. Позиции</span><span>2. Итог</span><span>3. КП</span></div>
      </div>
      <div class="v4-form-grid">
        <label>Название расчёта
          <input id="calcTitle" placeholder="Например: Баннер 3×2 с люверсами">
        </label>
        <label>Потребность
          <select id="calcNeedId">${needOptions()}</select>
        </label>
        <label>Комментарий для клиента
          <input id="calcPublicComment" placeholder="Что входит в стоимость">
        </label>
      </div>
      <div class="v4-calc-item-add">
        <h4>Добавить позицию</h4>
        <div class="v4-template-buttons">${renderTemplateButtons()}</div>
        <div class="v4-form-grid">
          <label>Название
            <input id="calcItemName" placeholder="Баннер 3×2, печать, люверсы">
          </label>
          <label>Ед.
            <select id="calcItemUnit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option></select>
          </label>
          <label>Кол-во
            <input id="calcItemQty" type="number" min="0" step="0.01" value="1">
          </label>
          <label>Себестоимость за ед.
            <input id="calcItemCost" type="number" min="0" step="1" value="0">
          </label>
          <label>Цена клиенту за ед.
            <input id="calcItemClient" type="number" min="0" step="1" value="0">
          </label>
          <label>Комментарий
            <input id="calcItemComment" placeholder="плотность, проклейка, монтаж и т.д.">
          </label>
        </div>
        <div class="v4-price-presets">
          <span>Быстро поставить цену от себестоимости:</span>
          <button type="button" data-price-multiplier="1.25">+25%</button>
          <button type="button" data-price-multiplier="1.4">+40%</button>
          <button type="button" data-price-multiplier="1.7">+70%</button>
          <button type="button" data-price-multiplier="2">×2</button>
        </div>
        <div id="calcItemPreview" class="v4-calc-live"></div>
        <div class="v4-form-actions">
          <button id="addCalcItemBtn" type="button" class="v4-primary">Добавить позицию в расчёт</button>
        </div>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table">
          <thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест.</th><th>Клиенту</th><th>Сумма</th><th></th></tr></thead>
          <tbody id="calcDraftItems"></tbody>
        </table>
      </div>
      <div id="calcDraftTotals" class="v4-calc-totals"></div>
      <div id="calcDraftGuide"></div>
      <div class="v4-form-actions">
        <button id="saveCalculationBtn" type="button" class="v4-primary">Сохранить расчёт</button>
        <button id="clearCalculationBtn" type="button">Очистить</button>
      </div>
    </div>
  `;
}

export function renderCalculations() {
  const box = byId('calculationsBox');
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '';
    return;
  }
  if (v4State.calculationsBusy) {
    box.innerHTML = '<div class="v4-empty">Загружаю расчёты...</div>';
    return;
  }
  const calculations = v4State.calculations || [];
  box.innerHTML = `
    <section class="v4-subcard v4-calculations-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Расчёты</h3>
          <p>Сохраняйте варианты расчёта до заказа. После сохранения можно сформировать КП и отправить клиенту понятный текст без себестоимости.</p>
        </div>
        <span class="v4-muted">Расчётов: ${calculations.length}</span>
      </div>
      <div class="v4-calculations-list">
        ${v4State.calculationsError ? `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>` : calculations.length ? calculations.map(renderCalcCard).join('') : '<div class="v4-empty">Расчётов пока нет. Начните с первого варианта: выберите шаблон позиции, внесите себестоимость и цену клиенту.</div>'}
      </div>
      ${renderCalcForm()}
    </section>
  `;
  renderDraftItems();
}

export async function loadCalculations(leadId = v4State.route.leadId) {
  if (!leadId || !v4State.crmReady) {
    setState({ calculations: [], calculationsBusy: false, calculationsError: null });
    renderCalculations();
    return [];
  }
  setState({ calculationsBusy: true, calculationsError: null });
  renderCalculations();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculations')
        .select(CALC_FIELDS)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      12000,
      'Расчёты не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    setState({ calculations: response.data || [], calculationsBusy: false, calculationsError: null });
    renderCalculations();
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    setState({ calculations: [], calculationsBusy: false, calculationsError: message });
    renderCalculations();
    setStatus(`Ошибка расчётов: ${message}`, 'error');
    return [];
  }
}

function fillDraftFromTemplate(key) {
  const template = QUICK_TEMPLATES.find((item) => item.key === key);
  if (!template) return;
  const title = byId('calcTitle');
  const name = byId('calcItemName');
  const unit = byId('calcItemUnit');
  const qty = byId('calcItemQty');
  const comment = byId('calcItemComment');
  if (title && !title.value.trim()) title.value = `${template.label} для ${v4State.currentLead?.name || 'клиента'}`;
  if (name) name.value = template.name;
  if (unit) unit.value = template.unit;
  if (qty) qty.value = String(template.qty);
  if (comment) comment.value = template.comment;
  renderItemPreview();
}

function applyPriceMultiplier(multiplier) {
  const cost = num('calcItemCost');
  if (!cost) {
    toast('Сначала укажите себестоимость за единицу');
    return;
  }
  const input = byId('calcItemClient');
  if (input) input.value = String(Math.ceil(cost * Number(multiplier || 1)));
  renderItemPreview();
}

function addDraftItem() {
  const item = {
    name: val('calcItemName') || 'Позиция расчёта',
    unit: val('calcItemUnit') || 'шт',
    qty: num('calcItemQty') || 1,
    contractor_price: num('calcItemCost'),
    client_price: num('calcItemClient'),
    comment: val('calcItemComment'),
    category: 'Ручная позиция',
    item_type: 'Услуга'
  };
  const calculated = calcItem(item, draftItems.length);
  if (calculated.client_sum <= 0) {
    toast('Укажите цену клиенту, иначе позиция будет нулевая');
    return;
  }
  if (calculated.profit < 0) {
    toast('Позиция убыточная. Проверьте себестоимость и цену клиенту');
    return;
  }
  draftItems.push(item);
  ['calcItemName', 'calcItemCost', 'calcItemClient', 'calcItemComment'].forEach((id) => { const input = byId(id); if (input) input.value = ''; });
  if (byId('calcItemQty')) byId('calcItemQty').value = '1';
  renderDraftItems();
}

async function rollbackCalculation(id) {
  if (!id) return;
  const rollback = await timeout(
    supabaseClient
      .from('leader_lead_calculations')
      .delete()
      .eq('id', id),
    10000,
    'Не удалось откатить пустой расчёт'
  );
  if (rollback.error) throw rollback.error;
}

async function saveCalculation() {
  if (!v4State.route.leadId || saveBusy) return;
  const result = totals();
  if (!result.items.length) {
    toast('Добавьте хотя бы одну позицию расчёта');
    return;
  }
  if (result.client_total <= 0 || result.profit < 0) {
    toast('Проверьте расчёт: сумма клиенту должна быть больше 0, расчёт не должен быть убыточным');
    return;
  }
  const calcPayload = {
    lead_id: v4State.route.leadId,
    need_id: val('calcNeedId') || null,
    client_id: v4State.currentLead?.converted_client_id || null,
    title: val('calcTitle') || 'Расчёт без названия',
    status: 'Черновик',
    version_number: (v4State.calculations || []).length + 1,
    client_total: result.client_total,
    contractor_cost: result.contractor_cost,
    profit: result.profit,
    margin_percent: result.margin_percent,
    warning_level: result.warning_level,
    warnings: result.warnings,
    public_comment: val('calcPublicComment'),
    internal_comment: '',
    created_by: v4State.user?.id || null,
    updated_by: v4State.user?.id || null
  };
  let createdCalculationId = null;
  saveBusy = true;
  const saveButton = byId('saveCalculationBtn');
  if (saveButton) saveButton.disabled = true;
  try {
    setStatus('Сохраняю расчёт...', 'warn');
    const calcResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculations')
        .insert(calcPayload)
        .select(CALC_FIELDS)
        .single(),
      14000,
      'Расчёт не сохранился за 14 секунд'
    );
    if (calcResponse.error) throw calcResponse.error;
    const calc = calcResponse.data;
    createdCalculationId = calc.id;
    const itemPayloads = result.items.map((item) => ({ ...item, calculation_id: calc.id, lead_id: v4State.route.leadId }));
    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .insert(itemPayloads)
        .select(ITEM_FIELDS),
      14000,
      'Позиции расчёта не сохранились за 14 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;
    setState({ calculations: [calc, ...(v4State.calculations || [])] });
    draftItems = [];
    renderCalculations();
    setStatus('Расчёт сохранён. Теперь можно сформировать КП ниже.', 'good');
    toast('Расчёт сохранён');
  } catch (error) {
    if (createdCalculationId) {
      try {
        await rollbackCalculation(createdCalculationId);
      } catch (rollbackError) {
        console.error('CRM v4 calculation rollback failed:', rollbackError);
      }
    }
    toast(friendlyError(error));
    setStatus(`Ошибка сохранения расчёта: ${friendlyError(error)}`, 'error');
  } finally {
    saveBusy = false;
    const currentSaveButton = byId('saveCalculationBtn');
    if (currentSaveButton) currentSaveButton.disabled = false;
  }
}

function bindCalculationEvents() {
  byId('leadCardSection')?.addEventListener('click', (event) => {
    if (event.target.closest('#addCalcItemBtn')) addDraftItem();
    if (event.target.closest('#clearCalculationBtn')) {
      draftItems = [];
      renderCalculations();
    }
    if (event.target.closest('#saveCalculationBtn')) saveCalculation();
    const template = event.target.closest('button[data-calc-template]');
    if (template) fillDraftFromTemplate(template.dataset.calcTemplate);
    const pricePreset = event.target.closest('button[data-price-multiplier]');
    if (pricePreset) applyPriceMultiplier(pricePreset.dataset.priceMultiplier);
    const remove = event.target.closest('button[data-action="remove-calc-item"]');
    if (remove) {
      draftItems.splice(Number(remove.dataset.index), 1);
      renderDraftItems();
    }
  });
  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target.closest('#calcItemName, #calcItemUnit, #calcItemQty, #calcItemCost, #calcItemClient, #calcItemComment')) {
      renderItemPreview();
    }
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => renderCalculations());
  document.addEventListener('leader-v4:needs-loaded', (event) => {
    if (event.detail?.leadId === v4State.route.leadId) refreshNeedSelect();
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    draftItems = [];
    if (id) loadCalculations(id);
    else {
      setState({ calculations: [], calculationsBusy: false, calculationsError: null });
      renderCalculations();
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadCalculations(v4State.route.leadId);
  });
}

export function bootCalculations() {
  bindCalculationEvents();
  renderCalculations();
  if (v4State.crmReady && v4State.route.leadId) loadCalculations(v4State.route.leadId);
}

document.addEventListener('DOMContentLoaded', bootCalculations);
