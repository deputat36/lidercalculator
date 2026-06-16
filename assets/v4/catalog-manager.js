import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CATALOG_FIELDS = 'id,category,name,unit,contractor_price,is_active,sort_order,description,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,settings,created_at,updated_at';
const GROUPS = ['banner', 'banner_extra', 'film', 'film_extra', 'sheet', 'photo', 'photo_extra', 'service', 'other'];
const MODES = ['markup', 'area', 'length', 'quantity', 'fixed'];

let rows = [];
let busy = false;
let errorText = '';
let filter = { search: '', category: 'Все', status: 'active' };

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

function inferGroup(row) {
  const explicit = row?.settings?.calculator_group;
  if (explicit) return explicit;
  const text = `${row?.category || ''} ${row?.name || ''}`.toLowerCase();
  if (text.includes('люверс') || text.includes('проклей') || text.includes('карман') || text.includes('шв')) return 'banner_extra';
  if (text.includes('баннер')) return 'banner';
  if (text.includes('монтажная плен') || text.includes('монтажная плён')) return 'film_extra';
  if (text.includes('плен') || text.includes('плён') || text.includes('owv')) return 'film';
  if (text.includes('пвх') || text.includes('металл') || text.includes('желез')) return 'sheet';
  if (text.includes('ламинац')) return 'photo_extra';
  if (text.includes('фото') || text.includes('a4')) return 'photo';
  return 'other';
}

function normalize(row) {
  const settings = row?.settings && typeof row.settings === 'object' ? row.settings : {};
  return {
    ...row,
    contractor_price: Number(row?.contractor_price || 0),
    markup_percent: Number(row?.markup_percent || 0),
    min_client_price: Number(row?.min_client_price || 0),
    default_client_price: row?.default_client_price == null ? null : Number(row.default_client_price),
    sort_order: Number(row?.sort_order || 0),
    is_active: row?.is_active !== false,
    settings: { ...settings, calculator_group: settings.calculator_group || inferGroup(row) }
  };
}

function ensureSection() {
  if (byId('catalogSection')) return byId('catalogSection');
  const workspace = byId('crmWorkspace');
  const nextCard = document.querySelector('.v4-next-card');
  if (!workspace) return null;
  const section = document.createElement('section');
  section.id = 'catalogSection';
  section.className = 'v4-card v4-catalog-section';
  if (nextCard) workspace.insertBefore(section, nextCard);
  else workspace.appendChild(section);
  return section;
}

function categories() {
  return ['Все', ...Array.from(new Set(rows.map((row) => row.category || 'Без категории'))).sort((a, b) => a.localeCompare(b, 'ru'))];
}

function filteredRows() {
  const query = filter.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status === 'active' && !row.is_active) return false;
    if (filter.status === 'inactive' && row.is_active) return false;
    if (filter.category !== 'Все' && row.category !== filter.category) return false;
    if (!query) return true;
    const haystack = `${row.name || ''} ${row.category || ''} ${row.unit || ''} ${row.item_type || ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

function optionList(values, current) {
  return values.map((value) => `<option value="${esc(value)}" ${String(current || '') === String(value) ? 'selected' : ''}>${esc(value)}</option>`).join('');
}

function rowPayload(rowId) {
  const source = rows.find((row) => row.id === rowId) || {};
  const group = byId(`cat_group_${rowId}`)?.value || inferGroup(source);
  const defaultRaw = byId(`cat_default_${rowId}`)?.value?.trim() || '';
  return {
    category: byId(`cat_category_${rowId}`)?.value?.trim() || 'Без категории',
    name: byId(`cat_name_${rowId}`)?.value?.trim() || 'Позиция',
    unit: byId(`cat_unit_${rowId}`)?.value?.trim() || 'шт',
    contractor_price: parseNum(byId(`cat_price_${rowId}`)?.value || 0),
    markup_percent: parseNum(byId(`cat_markup_${rowId}`)?.value || 0),
    min_client_price: parseNum(byId(`cat_min_${rowId}`)?.value || 0),
    default_client_price: defaultRaw === '' ? null : parseNum(defaultRaw),
    calculation_mode: byId(`cat_mode_${rowId}`)?.value || 'markup',
    item_type: byId(`cat_type_${rowId}`)?.value?.trim() || 'Изготовление',
    is_active: Boolean(byId(`cat_active_${rowId}`)?.checked),
    settings: { ...(source.settings || {}), calculator_group: group },
    updated_at: new Date().toISOString()
  };
}

async function logChange(oldRow, newRow, reason = 'Изменение из CRM v4') {
  try {
    await supabaseClient.from('leader_catalog_price_logs').insert({
      catalog_id: oldRow.id,
      change_type: 'catalog_update',
      reason,
      old_contractor_price: oldRow.contractor_price,
      new_contractor_price: newRow.contractor_price,
      old_markup_percent: oldRow.markup_percent,
      new_markup_percent: newRow.markup_percent,
      old_min_client_price: oldRow.min_client_price,
      new_min_client_price: newRow.min_client_price,
      old_default_client_price: oldRow.default_client_price,
      new_default_client_price: newRow.default_client_price,
      old_calculation_mode: oldRow.calculation_mode,
      new_calculation_mode: newRow.calculation_mode,
      old_is_active: oldRow.is_active,
      new_is_active: newRow.is_active,
      old_values: oldRow,
      new_values: newRow
    });
  } catch (error) {
    console.warn('CRM v4 catalog price log warning:', error);
  }
}

function renderRow(row) {
  const group = row.settings?.calculator_group || inferGroup(row);
  return `
    <tr data-catalog-row="${esc(row.id)}">
      <td><input id="cat_name_${esc(row.id)}" value="${esc(row.name)}"></td>
      <td><input id="cat_category_${esc(row.id)}" value="${esc(row.category)}"></td>
      <td><input id="cat_unit_${esc(row.id)}" value="${esc(row.unit)}"></td>
      <td><input id="cat_price_${esc(row.id)}" type="number" min="0" step="1" value="${esc(row.contractor_price)}"></td>
      <td><input id="cat_markup_${esc(row.id)}" type="number" step="1" value="${esc(row.markup_percent)}"></td>
      <td><input id="cat_min_${esc(row.id)}" type="number" min="0" step="1" value="${esc(row.min_client_price)}"></td>
      <td><input id="cat_default_${esc(row.id)}" type="number" min="0" step="1" value="${row.default_client_price == null ? '' : esc(row.default_client_price)}"></td>
      <td><select id="cat_group_${esc(row.id)}">${optionList(GROUPS, group)}</select></td>
      <td><select id="cat_mode_${esc(row.id)}">${optionList(MODES, row.calculation_mode || 'markup')}</select></td>
      <td><input id="cat_type_${esc(row.id)}" value="${esc(row.item_type || 'Изготовление')}"></td>
      <td><label class="v4-mini-check"><input id="cat_active_${esc(row.id)}" type="checkbox" ${row.is_active ? 'checked' : ''}> активна</label></td>
      <td><button type="button" data-catalog-save="${esc(row.id)}" class="v4-primary">Сохранить</button></td>
    </tr>
  `;
}

function renderCreateForm() {
  return `
    <details class="v4-catalog-create">
      <summary>Добавить новую позицию</summary>
      <div class="v4-catalog-create-grid">
        <label>Название<input id="newCatName" placeholder="Например: Баннерная печать 510"></label>
        <label>Категория<input id="newCatCategory" placeholder="Широкоформатная печать"></label>
        <label>Ед.<input id="newCatUnit" value="м²"></label>
        <label>Цена подрядчика<input id="newCatPrice" type="number" min="0" step="1" value="0"></label>
        <label>Наценка, %<input id="newCatMarkup" type="number" step="1" value="30"></label>
        <label>Группа калькулятора<select id="newCatGroup">${optionList(GROUPS, 'other')}</select></label>
      </div>
      <div class="v4-form-actions"><button id="createCatalogItemBtn" type="button" class="v4-primary">Добавить позицию</button></div>
    </details>
  `;
}

function render() {
  const section = ensureSection();
  if (!section) return;
  if (!v4State.crmReady) {
    section.innerHTML = '<div class="v4-empty">Номенклатура загрузится после входа.</div>';
    return;
  }
  const visible = filteredRows();
  const activeCount = rows.filter((row) => row.is_active).length;
  section.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Номенклатура и цены</h2>
        <p>Здесь редактируются цены подрядчика, наценка, активность и группа калькулятора. Расчёт заявки берёт цены отсюда.</p>
      </div>
      <button id="reloadCatalogBtn" type="button" class="v4-primary">Обновить справочник</button>
    </div>
    <div class="v4-lead-stats">
      <div><span>Всего позиций</span><b>${rows.length}</b></div>
      <div><span>Активных</span><b>${activeCount}</b></div>
      <div><span>Категорий</span><b>${Math.max(0, categories().length - 1)}</b></div>
      <div><span>Показано</span><b>${visible.length}</b></div>
    </div>
    <div class="v4-filters v4-catalog-filters">
      <label>Статус<select id="catalogStatusFilter"><option value="active" ${filter.status === 'active' ? 'selected' : ''}>Только активные</option><option value="all" ${filter.status === 'all' ? 'selected' : ''}>Все</option><option value="inactive" ${filter.status === 'inactive' ? 'selected' : ''}>Отключённые</option></select></label>
      <label>Категория<select id="catalogCategoryFilter">${categories().map((category) => `<option value="${esc(category)}" ${filter.category === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}</select></label>
      <label>Поиск<input id="catalogSearchFilter" type="search" value="${esc(filter.search)}" placeholder="Название, категория, тип"></label>
    </div>
    ${errorText ? `<div class="v4-empty is-error">${esc(errorText)}</div>` : ''}
    ${renderCreateForm()}
    <div class="v4-table-wrap v4-catalog-table-wrap">
      <table class="v4-table v4-catalog-table">
        <thead><tr><th>Название</th><th>Категория</th><th>Ед.</th><th>Подрядчик</th><th>Наценка %</th><th>Мин.</th><th>Цена по умолч.</th><th>Группа</th><th>Режим</th><th>Тип</th><th>Активность</th><th></th></tr></thead>
        <tbody>${busy ? '<tr><td colspan="12">Загружаю номенклатуру...</td></tr>' : visible.length ? visible.map(renderRow).join('') : '<tr><td colspan="12">Позиции не найдены.</td></tr>'}</tbody>
      </table>
    </div>
  `;
}

export async function loadCatalogManager() {
  if (!v4State.crmReady || busy) {
    render();
    return rows;
  }
  busy = true;
  errorText = '';
  render();
  try {
    const response = await timeout(
      supabaseClient.from('leader_catalog').select(CATALOG_FIELDS).order('sort_order', { ascending: true }).order('name', { ascending: true }),
      12000,
      'Номенклатура не загрузилась за 12 секунд'
    );
    if (response.error) throw response.error;
    rows = (response.data || []).map(normalize);
    setStatus(`Номенклатура загружена: ${rows.length} позиций`, 'good');
  } catch (error) {
    errorText = friendlyError(error);
    setStatus(`Ошибка номенклатуры: ${errorText}`, 'error');
  } finally {
    busy = false;
    render();
  }
  return rows;
}

async function saveRow(rowId) {
  const oldRow = rows.find((row) => row.id === rowId);
  if (!oldRow) return;
  const patch = rowPayload(rowId);
  try {
    setStatus('Сохраняю позицию номенклатуры...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_catalog').update(patch).eq('id', rowId).select(CATALOG_FIELDS).single(),
      12000,
      'Позиция не сохранилась за 12 секунд'
    );
    if (response.error) throw response.error;
    const updated = normalize(response.data);
    rows = rows.map((row) => row.id === rowId ? updated : row);
    await logChange(oldRow, updated);
    render();
    setStatus('Позиция номенклатуры сохранена', 'good');
    toast('Позиция сохранена');
  } catch (error) {
    setStatus(`Ошибка сохранения позиции: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  }
}

async function createRow() {
  const name = byId('newCatName')?.value?.trim() || '';
  if (!name) {
    toast('Введите название позиции');
    return;
  }
  const group = byId('newCatGroup')?.value || 'other';
  const payload = {
    name,
    category: byId('newCatCategory')?.value?.trim() || 'Без категории',
    unit: byId('newCatUnit')?.value?.trim() || 'шт',
    contractor_price: parseNum(byId('newCatPrice')?.value || 0),
    markup_percent: parseNum(byId('newCatMarkup')?.value || 30),
    min_client_price: 0,
    default_client_price: null,
    calculation_mode: 'markup',
    item_type: group.includes('extra') ? 'Доп. услуга' : 'Изготовление',
    is_active: true,
    sort_order: rows.length + 1,
    settings: { calculator_group: group }
  };
  try {
    setStatus('Добавляю позицию номенклатуры...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_catalog').insert(payload).select(CATALOG_FIELDS).single(),
      12000,
      'Позиция не добавилась за 12 секунд'
    );
    if (response.error) throw response.error;
    const created = normalize(response.data);
    rows = [created, ...rows];
    await logChange({ ...created, contractor_price: null, markup_percent: null, is_active: null }, created, 'Создание позиции из CRM v4');
    render();
    setStatus('Позиция добавлена', 'good');
    toast('Позиция добавлена');
  } catch (error) {
    setStatus(`Ошибка добавления позиции: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  }
}

function bindEvents() {
  document.addEventListener('leader-v4:crm-ready', loadCatalogManager);
  document.addEventListener('DOMContentLoaded', () => {
    ensureSection();
    render();
    if (v4State.crmReady) loadCatalogManager();
  });
  document.addEventListener('click', async (event) => {
    if (event.target.closest('#reloadCatalogBtn')) await loadCatalogManager();
    if (event.target.closest('#createCatalogItemBtn')) await createRow();
    const save = event.target.closest('button[data-catalog-save]');
    if (save) await saveRow(save.dataset.catalogSave);
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest('#catalogSearchFilter')) {
      filter.search = event.target.value || '';
      render();
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target.closest('#catalogStatusFilter')) {
      filter.status = event.target.value || 'active';
      render();
    }
    if (event.target.closest('#catalogCategoryFilter')) {
      filter.category = event.target.value || 'Все';
      render();
    }
  });
}

bindEvents();
