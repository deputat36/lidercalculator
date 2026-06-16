import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let selectedCalculationId = null;
let selectedItems = [];
let detailsBusy = false;
let detailsError = '';
let copyBusy = false;
let lastLeadId = null;
let renderTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
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
        <button type="button" data-saved-calc-copy="${esc(calc.id)}" ${hasOrder ? 'disabled title="Нельзя копировать расчёт, по которому уже создан заказ"' : ''}>Копировать</button>
      </div>
    </article>
  `;
}

function renderDetails() {
  const calc = selectedCalculation();
  if (!selectedCalculationId) return '<div class="v4-empty">Выберите расчёт выше и нажмите «Состав».</div>';
  if (detailsBusy) return '<div class="v4-empty">Загружаю состав расчёта...</div>';
  if (detailsError) return `<div class="v4-empty is-error">${esc(detailsError)}</div>`;
  if (!calc) return '<div class="v4-empty is-error">Расчёт не найден в текущей карточке.</div>';
  if (!selectedItems.length) return '<div class="v4-empty">В расчёте нет сохранённых позиций.</div>';
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
          <p>Откройте состав расчёта, проверьте строки или создайте копию расчёта для нового варианта цены.</p>
        </div>
        <span class="v4-muted">Расчётов: ${calculations.length}</span>
      </div>
      <div class="v4-saved-calc-list">
        ${v4State.calculationsBusy ? '<div class="v4-empty">Загружаю расчёты...</div>' : calculations.length ? calculations.map(renderMiniCard).join('') : '<div class="v4-empty">Сначала сохраните расчёт выше.</div>'}
      </div>
      ${renderDetails()}
    </section>
  `;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 40);
}

async function loadItems(calculationId) {
  selectedCalculationId = calculationId;
  selectedItems = [];
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

async function copyCalculation(calculationId) {
  if (copyBusy) return;
  const source = (v4State.calculations || []).find((calc) => calc.id === calculationId);
  if (!source) {
    toast('Исходный расчёт не найден');
    return;
  }
  if (source.order_id) {
    toast('Нельзя копировать расчёт, по которому уже создан заказ');
    return;
  }
  copyBusy = true;
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

    const copyPayload = {
      lead_id: v4State.route.leadId,
      need_id: source.need_id || null,
      client_id: source.client_id || null,
      title: `Копия: ${source.title || 'Расчёт'}`,
      status: 'Черновик',
      version_number: (v4State.calculations || []).length + 1,
      client_total: source.client_total,
      contractor_cost: source.contractor_cost,
      profit: source.profit,
      margin_percent: source.margin_percent,
      warning_level: source.warning_level || 'ok',
      warnings: Array.isArray(source.warnings) ? source.warnings : [],
      public_comment: source.public_comment || '',
      internal_comment: `Скопировано из расчёта ${source.id}`,
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    };

    const calcResponse = await timeout(
      supabaseClient.from('leader_lead_calculations').insert(copyPayload).select(CALC_FIELDS).single(),
      14000,
      'Копия расчёта не сохранилась за 14 секунд'
    );
    if (calcResponse.error) throw calcResponse.error;
    const created = calcResponse.data;

    const itemPayloads = items.map((item, index) => stripItemForCopy(item, created.id, index));
    const insertItems = await timeout(
      supabaseClient.from('leader_lead_calculation_items').insert(itemPayloads).select(ITEM_FIELDS),
      14000,
      'Позиции копии расчёта не сохранились за 14 секунд'
    );
    if (insertItems.error) {
      await supabaseClient.from('leader_lead_calculations').delete().eq('id', created.id);
      throw insertItems.error;
    }

    setState({ calculations: [created, ...(v4State.calculations || [])] });
    await loadItems(created.id);
    setStatus('Копия расчёта создана', 'good');
    toast('Копия расчёта создана');
  } catch (error) {
    setStatus(`Ошибка копирования расчёта: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    copyBusy = false;
    render();
  }
}

function bindEvents() {
  document.addEventListener('leader-v4:lead-card-rendered', scheduleRender);
  document.addEventListener('leader-v4:route-change', () => {
    selectedCalculationId = null;
    selectedItems = [];
    detailsError = '';
    scheduleRender();
  });
  document.addEventListener('leader-v4:crm-ready', scheduleRender);
  subscribeState(scheduleRender);
  document.addEventListener('click', async (event) => {
    const details = event.target.closest('button[data-saved-calc-details]');
    if (details) {
      await loadItems(details.dataset.savedCalcDetails);
      return;
    }
    const copy = event.target.closest('button[data-saved-calc-copy]');
    if (copy) {
      await copyCalculation(copy.dataset.savedCalcCopy);
      return;
    }
    if (event.target.closest('button[data-saved-calc-close]')) {
      selectedCalculationId = null;
      selectedItems = [];
      detailsError = '';
      render();
    }
  });
}

bindEvents();
scheduleRender();
