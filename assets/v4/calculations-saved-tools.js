import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let selectedCalculationId = null;
let selectedItems = [];
let detailsMode = 'view';
let detailsBusy = false;
let detailsError = '';
let actionBusy = false;
let lastLeadId = null;
let renderTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function parseNum(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function ensureHost() {
  const leadCard = byId('leadCardContent');
  if (!leadCard) return null;
  if (byId('savedCalcToolsBox')) return byId('savedCalcToolsBox');
  const calculationsBox = byId('calculationsBox');
  if (!calculationsBox) return null;
  calculationsBox.insertAdjacentHTML('afterend', '<section id="savedCalcToolsBox" class="v4-saved-calc-host"></section>');
  return byId('savedCalcToolsBox');
}

function resetOnLeadChange() {
  const currentLeadId = v4State.route.leadId || null;
  if (lastLeadId === currentLeadId) return;
  lastLeadId = currentLeadId;
  selectedCalculationId = null;
  selectedItems = [];
  detailsMode = 'view';
  detailsError = '';
  detailsBusy = false;
}

function selectedCalculation() {
  return (v4State.calculations || []).find((calc) => calc.id === selectedCalculationId) || null;
}

function renderMiniCard(calc) {
  const active = calc.id === selectedCalculationId ? ' is-active' : '';
  const hasOrder = Boolean(calc.order_id);
  const hasOffer = Boolean(calc.commercial_offer_id);
  return `
    <article class="v4-saved-calc-card${active}" data-saved-calc="${esc(calc.id)}">
      <div>
        <div class="v4-saved-calc-title"><h4>${esc(calc.title || 'Расчёт')}</h4><span>${esc(calc.status || 'Черновик')}</span></div>
        <div class="v4-saved-calc-meta">
          <span><b>Клиенту:</b> ${money(calc.client_total)}</span>
          <span><b>Себест.:</b> ${money(calc.contractor_cost)}</span>
          <span><b>Прибыль:</b> ${money(calc.profit)}</span>
          <span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span>
          ${hasOffer ? '<span>Есть КП</span>' : ''}
          ${hasOrder ? '<span>Есть заказ</span>' : ''}
        </div>
      </div>
      <div class="v4-saved-calc-actions">
        <button type="button" data-saved-calc-details="${esc(calc.id)}">Состав</button>
        <button type="button" data-saved-calc-edit="${esc(calc.id)}" ${hasOrder ? 'disabled title="Нельзя редактировать расчёт, по которому уже создан заказ"' : ''}>Изменить версию</button>
        <button type="button" data-saved-calc-copy="${esc(calc.id)}" ${hasOrder ? 'disabled title="Нельзя копировать расчёт, по которому уже создан заказ"' : ''}>Копировать</button>
      </div>
    </article>
  `;
}

function calculatedItem(raw, index = 0) {
  const qty = Number(raw.qty || 0);
  const contractorPrice = Number(raw.contractor_price || 0);
  const clientPrice = Number(raw.client_price || 0);
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  return {
    catalog_id: raw.catalog_id || null,
    category: raw.category || null,
    item_type: raw.item_type || 'Услуга',
    name: raw.name || `Позиция ${index + 1}`,
    unit: raw.unit || 'шт',
    qty,
    contractor_price: contractorPrice,
    contractor_sum: contractorSum,
    markup_percent: contractorSum > 0 ? ((clientSum - contractorSum) / contractorSum) * 100 : 0,
    client_price: clientPrice,
    client_sum: clientSum,
    profit,
    margin_percent: clientSum > 0 ? (profit / clientSum) * 100 : 0,
    comment: raw.comment || '',
    data: raw.data || {},
    sort_order: index + 1
  };
}

function totals(items) {
  const rows = items.map(calculatedItem);
  const contractor = rows.reduce((sum, item) => sum + item.contractor_sum, 0);
  const client = rows.reduce((sum, item) => sum + item.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!rows.length) warnings.push('Нет позиций расчёта');
  if (client <= 0) warnings.push('Сумма клиенту равна 0');
  if (contractor <= 0) warnings.push('Себестоимость равна 0');
  if (profit < 0) warnings.push('Расчёт убыточный');
  if (client > 0 && margin < 20) warnings.push('Маржа ниже 20%');
  return {
    items: rows,
    contractor_cost: contractor,
    client_total: client,
    profit,
    margin_percent: margin,
    warnings,
    warning_level: warnings.some((item) => item.includes('убыточный') || item.includes('равна 0')) ? 'critical' : warnings.length ? 'warning' : 'ok'
  };
}

function renderViewDetails(calc) {
  const rows = selectedItems.map((item) => `
    <tr>
      <td>${esc(item.name || 'Позиция')}<small>${esc(item.comment || '')}</small></td>
      <td>${esc(item.category || '—')}</td>
      <td>${esc(item.unit || 'шт')}</td>
      <td>${Number(item.qty || 0).toLocaleString('ru-RU')}</td>
      <td>${money(item.contractor_price)}</td>
      <td>${money(item.client_price)}</td>
      <td>${money(item.client_sum)}</td>
      <td>${Math.round(Number(item.margin_percent || 0))}%</td>
    </tr>
  `).join('');
  return `
    <div class="v4-saved-calc-details">
      <div class="v4-subcard-head">
        <div>
          <h3>Состав расчёта: ${esc(calc.title || 'Расчёт')}</h3>
          <p>Создан: ${formatDate(calc.created_at)}. Эти строки используются для КП и создания заказа.</p>
        </div>
        <button type="button" data-saved-calc-close>Скрыть состав</button>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table v4-saved-calc-table">
          <thead><tr><th>Позиция</th><th>Категория</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма</th><th>Маржа</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function editableItemsFromDom() {
  return selectedItems.map((source, index) => ({
    id: source.id || null,
    catalog_id: source.catalog_id || null,
    category: byId(`editCalcCategory_${index}`)?.value?.trim() || source.category || null,
    item_type: source.item_type || 'Услуга',
    name: byId(`editCalcName_${index}`)?.value?.trim() || source.name || `Позиция ${index + 1}`,
    unit: byId(`editCalcUnit_${index}`)?.value?.trim() || source.unit || 'шт',
    qty: parseNum(byId(`editCalcQty_${index}`)?.value || source.qty || 0),
    contractor_price: parseNum(byId(`editCalcCost_${index}`)?.value || source.contractor_price || 0),
    client_price: parseNum(byId(`editCalcClient_${index}`)?.value || source.client_price || 0),
    comment: byId(`editCalcComment_${index}`)?.value?.trim() || source.comment || '',
    data: { ...(source.data || {}), edited_from_item_id: source.id || null }
  }));
}

function renderEditTotals(items = editableItemsFromDom()) {
  const box = byId('savedCalcEditTotals');
  if (!box) return;
  const result = totals(items);
  box.className = `v4-calc-totals v4-calc-total-panel ${result.warning_level === 'critical' ? 'is-error' : result.warning_level === 'warning' ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `
    <span><b>Клиенту:</b> ${money(result.client_total)}</span>
    <span><b>Себестоимость:</b> ${money(result.contractor_cost)}</span>
    <span><b>Прибыль:</b> ${money(result.profit)}</span>
    <span><b>Маржа:</b> ${Math.round(result.margin_percent)}%</span>
    ${result.warnings.length ? `<span><b>Проверить:</b> ${esc(result.warnings.join(', '))}</span>` : ''}
  `;
}

function renderEditDetails(calc) {
  const rows = selectedItems.map((item, index) => `
    <tr>
      <td><input id="editCalcName_${index}" value="${esc(item.name || 'Позиция')}"><small><input id="editCalcComment_${index}" value="${esc(item.comment || '')}" placeholder="Комментарий"></small></td>
      <td><input id="editCalcCategory_${index}" value="${esc(item.category || '')}"></td>
      <td><input id="editCalcUnit_${index}" value="${esc(item.unit || 'шт')}"></td>
      <td><input id="editCalcQty_${index}" type="number" min="0" step="0.01" value="${esc(item.qty || 0)}"></td>
      <td><input id="editCalcCost_${index}" type="number" min="0" step="1" value="${esc(item.contractor_price || 0)}"></td>
      <td><input id="editCalcClient_${index}" type="number" min="0" step="1" value="${esc(item.client_price || 0)}"></td>
    </tr>
  `).join('');
  return `
    <div class="v4-saved-calc-details v4-saved-calc-editor">
      <div class="v4-subcard-head">
        <div>
          <h3>Новая версия расчёта</h3>
          <p>Старый расчёт не изменится. После сохранения появится новый черновик с пересчитанными суммами.</p>
        </div>
        <button type="button" data-saved-calc-close>Закрыть редактор</button>
      </div>
      <div class="v4-form-grid v4-saved-calc-version-form">
        <label>Название новой версии
          <input id="editCalcTitle" value="${esc(`Новая версия: ${calc.title || 'Расчёт'}`)}">
        </label>
        <label>Комментарий для клиента
          <input id="editCalcPublicComment" value="${esc(calc.public_comment || '')}">
        </label>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table v4-saved-calc-edit-table">
          <thead><tr><th>Позиция / комментарий</th><th>Категория</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="savedCalcEditTotals" class="v4-calc-totals"></div>
      <div class="v4-form-actions">
        <button type="button" id="saveEditedCalculationBtn" class="v4-primary">Сохранить как новую версию</button>
      </div>
    </div>
  `;
}

function renderDetails() {
  const calc = selectedCalculation();
  if (!selectedCalculationId) return '<div class="v4-empty">Выберите расчёт выше и нажмите «Состав» или «Изменить версию».</div>';
  if (detailsBusy) return '<div class="v4-empty">Загружаю состав расчёта...</div>';
  if (detailsError) return `<div class="v4-empty is-error">${esc(detailsError)}</div>`;
  if (!calc) return '<div class="v4-empty is-error">Расчёт не найден в текущей карточке.</div>';
  if (!selectedItems.length) return '<div class="v4-empty">В расчёте нет сохранённых позиций.</div>';
  return detailsMode === 'edit' ? renderEditDetails(calc) : renderViewDetails(calc);
}

function render() {
  resetOnLeadChange();
  const host = ensureHost();
  if (!host) return;
  if (!v4State.route.leadId) {
    host.innerHTML = '';
    return;
  }
  const calculations = v4State.calculations || [];
  host.innerHTML = `
    <section class="v4-subcard v4-saved-calc-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Сохранённые расчёты — инструменты</h3>
          <p>Откройте состав, создайте копию или измените строки как новую версию без перезаписи старого расчёта.</p>
        </div>
        <span class="v4-muted">Расчётов: ${calculations.length}</span>
      </div>
      <div class="v4-saved-calc-list">
        ${v4State.calculationsBusy ? '<div class="v4-empty">Загружаю расчёты...</div>' : calculations.length ? calculations.map(renderMiniCard).join('') : '<div class="v4-empty">Сначала сохраните расчёт выше.</div>'}
      </div>
      ${renderDetails()}
    </section>
  `;
  if (detailsMode === 'edit') renderEditTotals(selectedItems);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 40);
}

async function loadItems(calculationId, mode = 'view') {
  selectedCalculationId = calculationId;
  selectedItems = [];
  detailsMode = mode;
  detailsError = '';
  detailsBusy = true;
  render();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select(ITEM_FIELDS)
        .eq('calculation_id', calculationId)
        .order('sort_order', { ascending: true }),
      12000,
      'Состав расчёта не загрузился за 12 секунд'
    );
    if (response.error) throw response.error;
    selectedItems = response.data || [];
  } catch (error) {
    detailsError = friendlyError(error);
    setStatus(`Ошибка состава расчёта: ${detailsError}`, 'error');
  } finally {
    detailsBusy = false;
    render();
  }
}

function stripItemForCopy(item, newCalculationId, index) {
  return {
    calculation_id: newCalculationId,
    lead_id: v4State.route.leadId,
    catalog_id: item.catalog_id || null,
    category: item.category || null,
    item_type: item.item_type || 'Услуга',
    name: item.name || 'Позиция',
    unit: item.unit || 'шт',
    qty: Number(item.qty || 0),
    contractor_price: Number(item.contractor_price || 0),
    contractor_sum: Number(item.contractor_sum || 0),
    markup_percent: Number(item.markup_percent || 0),
    client_price: Number(item.client_price || 0),
    client_sum: Number(item.client_sum || 0),
    profit: Number(item.profit || 0),
    margin_percent: Number(item.margin_percent || 0),
    comment: item.comment || '',
    data: { ...(item.data || {}), copied_from_item_id: item.id || null },
    sort_order: index + 1
  };
}

async function createCalculationVersion(source, itemPayloads, title, publicComment, internalComment) {
  const calculated = totals(itemPayloads);
  if (!calculated.items.length || calculated.client_total <= 0 || calculated.profit < 0) {
    throw new Error('Новая версия расчёта пустая или убыточная');
  }
  let created = null;
  const calcResponse = await timeout(
    supabaseClient.from('leader_lead_calculations').insert({
      lead_id: v4State.route.leadId,
      need_id: source.need_id || null,
      client_id: source.client_id || null,
      title,
      status: 'Черновик',
      version_number: (v4State.calculations || []).length + 1,
      client_total: calculated.client_total,
      contractor_cost: calculated.contractor_cost,
      profit: calculated.profit,
      margin_percent: calculated.margin_percent,
      warning_level: calculated.warning_level,
      warnings: calculated.warnings,
      public_comment: publicComment || '',
      internal_comment: internalComment || '',
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    }).select(CALC_FIELDS).single(),
    14000,
    'Новая версия расчёта не сохранилась за 14 секунд'
  );
  if (calcResponse.error) throw calcResponse.error;
  created = calcResponse.data;
  const items = calculated.items.map((item, index) => ({ ...item, calculation_id: created.id, lead_id: v4State.route.leadId, sort_order: index + 1 }));
  const insertItems = await timeout(
    supabaseClient.from('leader_lead_calculation_items').insert(items).select(ITEM_FIELDS),
    14000,
    'Позиции новой версии не сохранились за 14 секунд'
  );
  if (insertItems.error) {
    await supabaseClient.from('leader_lead_calculations').delete().eq('id', created.id);
    throw insertItems.error;
  }
  setState({ calculations: [created, ...(v4State.calculations || [])] });
  return created;
}

async function copyCalculation(calculationId) {
  if (actionBusy) return;
  const source = (v4State.calculations || []).find((calc) => calc.id === calculationId);
  if (!source) {
    toast('Исходный расчёт не найден');
    return;
  }
  if (source.order_id) {
    toast('Нельзя копировать расчёт, по которому уже создан заказ');
    return;
  }
  actionBusy = true;
  try {
    setStatus('Копирую расчёт...', 'warn');
    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select(ITEM_FIELDS)
        .eq('calculation_id', calculationId)
        .order('sort_order', { ascending: true }),
      12000,
      'Позиции исходного расчёта не загрузились за 12 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;
    const items = itemsResponse.data || [];
    if (!items.length) throw new Error('В исходном расчёте нет позиций');
    const copyItems = items.map((item, index) => stripItemForCopy(item, null, index));
    const created = await createCalculationVersion(source, copyItems, `Копия: ${source.title || 'Расчёт'}`, source.public_comment || '', `Скопировано из расчёта ${source.id}`);
    await loadItems(created.id, 'view');
    setStatus('Копия расчёта создана', 'good');
    toast('Копия расчёта создана');
  } catch (error) {
    setStatus(`Ошибка копирования расчёта: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    actionBusy = false;
    render();
  }
}

async function saveEditedVersion() {
  if (actionBusy) return;
  const source = selectedCalculation();
  if (!source) {
    toast('Выберите расчёт');
    return;
  }
  if (source.order_id) {
    toast('Нельзя редактировать расчёт, по которому уже создан заказ');
    return;
  }
  const edited = editableItemsFromDom();
  const title = byId('editCalcTitle')?.value?.trim() || `Новая версия: ${source.title || 'Расчёт'}`;
  const publicComment = byId('editCalcPublicComment')?.value?.trim() || '';
  actionBusy = true;
  try {
    setStatus('Сохраняю новую версию расчёта...', 'warn');
    const created = await createCalculationVersion(source, edited, title, publicComment, `Новая версия на основе расчёта ${source.id}`);
    await loadItems(created.id, 'view');
    setStatus('Новая версия расчёта сохранена', 'good');
    toast('Новая версия расчёта сохранена');
  } catch (error) {
    setStatus(`Ошибка новой версии: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    actionBusy = false;
    render();
  }
}

function bindEvents() {
  document.addEventListener('leader-v4:lead-card-rendered', scheduleRender);
  document.addEventListener('leader-v4:route-change', () => {
    selectedCalculationId = null;
    selectedItems = [];
    detailsMode = 'view';
    detailsError = '';
    scheduleRender();
  });
  document.addEventListener('leader-v4:crm-ready', scheduleRender);
  subscribeState(scheduleRender);
  document.addEventListener('click', async (event) => {
    const details = event.target.closest('button[data-saved-calc-details]');
    if (details) {
      await loadItems(details.dataset.savedCalcDetails, 'view');
      return;
    }
    const edit = event.target.closest('button[data-saved-calc-edit]');
    if (edit) {
      await loadItems(edit.dataset.savedCalcEdit, 'edit');
      return;
    }
    const copy = event.target.closest('button[data-saved-calc-copy]');
    if (copy) {
      await copyCalculation(copy.dataset.savedCalcCopy);
      return;
    }
    if (event.target.closest('#saveEditedCalculationBtn')) {
      await saveEditedVersion();
      return;
    }
    if (event.target.closest('button[data-saved-calc-close]')) {
      selectedCalculationId = null;
      selectedItems = [];
      detailsMode = 'view';
      detailsError = '';
      render();
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest('.v4-saved-calc-editor')) renderEditTotals();
  });
}

bindEvents();
scheduleRender();
