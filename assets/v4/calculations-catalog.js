import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';
const CATALOG_FIELDS = 'id,category,name,unit,contractor_price,is_active,sort_order,description,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,settings';

const FALLBACK_CATALOG = [
  ['Широкоформатная печать', 'Баннер 340/440 — стандарт', 'м²', 350, 'banner'],
  ['Широкоформатная печать', 'Баннер 340/440 — устойчивая печать', 'м²', 450, 'banner'],
  ['Широкоформатная печать', 'Самоклеящаяся пленка (мат/гл/прозр.)', 'м²', 550, 'film'],
  ['Широкоформатная печать', 'Перфорированная пленка (OWV)', 'м²', 750, 'film'],
  ['Услуги по баннерам', 'Установка люверсов', 'шт', 15, 'banner_extra'],
  ['Услуги по баннерам', 'Проклейка баннера по краю', 'м', 30, 'banner_extra'],
  ['Услуги по баннерам', 'Склейка швов/карман', 'м', 60, 'banner_extra'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 3 мм', 'м²', 1400, 'sheet'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 4 мм', 'м²', 1800, 'sheet'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 5 мм', 'м²', 2150, 'sheet'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 6 мм', 'м²', 2650, 'sheet'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 8 мм', 'м²', 3800, 'sheet'],
  ['Пленка и листовые материалы', 'ПВХ вспененный 10 мм', 'м²', 4400, 'sheet'],
  ['Пленка и листовые материалы', 'Железо (листовой металл)', 'м²', 1500, 'sheet'],
  ['Пленка и листовые материалы', 'Самоклеящаяся мономерная пленка', 'м²', 700, 'film'],
  ['Пленка и листовые материалы', 'Монтажная пленка', 'м²', 300, 'film_extra'],
  ['Печать фото', 'A4 фото (одна сторона)', 'шт', 40, 'photo'],
  ['Печать фото', 'A4 ламинация', 'шт', 40, 'photo_extra']
].map(([category, name, unit, price, group], index) => ({
  id: null,
  category,
  name,
  unit,
  price,
  is_active: true,
  sort_order: index + 1,
  item_type: group.includes('extra') ? 'Доп. услуга' : 'Изготовление',
  markup_percent: 30,
  min_client_price: 0,
  default_client_price: null,
  calculation_mode: 'markup',
  settings: { calculator_group: group }
}));

let catalog = [...FALLBACK_CATALOG];
let catalogLoaded = false;
let catalogBusy = false;
let draftItems = [];
let renderTimer = null;
let saving = false;

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

function inputNum(id) {
  return parseNum(byId(id)?.value || '');
}

function inputValue(id) {
  return byId(id)?.value?.trim() || '';
}

function inputChecked(id) {
  return Boolean(byId(id)?.checked);
}

function inferGroup(row) {
  const explicit = row?.settings?.calculator_group;
  if (explicit) return explicit;
  const text = `${row?.category || ''} ${row?.name || ''}`.toLowerCase();
  if (text.includes('люверс') || text.includes('проклей') || text.includes('шв') || text.includes('карман')) return 'banner_extra';
  if (text.includes('баннер')) return 'banner';
  if (text.includes('монтажная плен') || text.includes('монтажная плён')) return 'film_extra';
  if (text.includes('плен') || text.includes('плён') || text.includes('owv')) return 'film';
  if (text.includes('пвх') || text.includes('желез') || text.includes('металл')) return 'sheet';
  if (text.includes('ламинац')) return 'photo_extra';
  if (text.includes('фото') || text.includes('a4')) return 'photo';
  return 'other';
}

function normalizeCatalog(row) {
  const settings = row?.settings && typeof row.settings === 'object' ? row.settings : {};
  const normalized = {
    id: row?.id || null,
    category: row?.category || 'Без категории',
    name: row?.name || 'Позиция',
    unit: row?.unit || 'шт',
    price: Number(row?.contractor_price ?? row?.price ?? 0),
    is_active: row?.is_active !== false,
    sort_order: Number(row?.sort_order || 0),
    description: row?.description || '',
    item_type: row?.item_type || 'Изготовление',
    markup_percent: Number(row?.markup_percent ?? 30),
    min_client_price: Number(row?.min_client_price || 0),
    default_client_price: row?.default_client_price == null ? null : Number(row.default_client_price),
    calculation_mode: row?.calculation_mode || 'markup',
    settings
  };
  normalized.settings.calculator_group = inferGroup(normalized);
  return normalized;
}

async function loadCatalog() {
  if (catalogBusy || !v4State.crmReady) return catalog;
  catalogBusy = true;
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_catalog')
        .select(CATALOG_FIELDS)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      12000,
      'Номенклатура не загрузилась за 12 секунд'
    );
    if (response.error) throw response.error;
    const rows = (response.data || []).map(normalizeCatalog).filter((item) => item.name && item.is_active);
    if (rows.length) {
      catalog = rows;
      catalogLoaded = true;
      setStatus(`Номенклатура загружена: ${rows.length} позиций`, 'good');
      scheduleRender();
    }
  } catch (error) {
    catalogLoaded = false;
    console.warn('CRM v4 catalog fallback:', error);
  } finally {
    catalogBusy = false;
  }
  return catalog;
}

function catalogByName(name) {
  return catalog.find((item) => item.name === name) || FALLBACK_CATALOG.find((item) => item.name === name) || null;
}

function catalogByGroup(group) {
  const rows = catalog.filter((item) => item.settings.calculator_group === group);
  return rows.length ? rows : FALLBACK_CATALOG.filter((item) => item.settings.calculator_group === group);
}

function catalogOptions(group, selected) {
  return catalogByGroup(group)
    .map((item) => `<option value="${esc(item.name)}" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.price)} / ${esc(item.unit)}</option>`)
    .join('');
}

function markupSettings() {
  const fixed = inputValue('catCalcMarkup');
  const fixedValue = fixed === '' ? null : parseNum(fixed);
  return {
    fixedMarkup: fixedValue == null ? null : (fixedValue > 1 ? fixedValue / 100 : fixedValue),
    smallLimit: inputNum('catCalcSmallLimit') || 3000,
    smallMarkup: (inputNum('catCalcSmallMarkup') || 30) / 100,
    medLimit: inputNum('catCalcMedLimit') || 10000,
    medMarkup: (inputNum('catCalcMedMarkup') || 20) / 100,
    largeMarkup: (inputNum('catCalcLargeMarkup') || 10) / 100,
    roundStep: Math.max(1, inputNum('catCalcRoundStep') || 10)
  };
}

function autoMarkup(subtotal) {
  const settings = markupSettings();
  if (settings.fixedMarkup !== null) return settings.fixedMarkup;
  if (subtotal <= settings.smallLimit) return settings.smallMarkup;
  if (subtotal <= settings.medLimit) return settings.medMarkup;
  return settings.largeMarkup;
}

function makeItem(catalogItem, name, qty, comment, data = {}, clientPrice = 0, contractorPrice = null) {
  const source = catalogItem || {};
  return {
    catalog_id: source.id || null,
    category: source.category || 'Расчёт',
    item_type: source.item_type || 'Услуга',
    name: name || source.name || 'Позиция',
    unit: source.unit || 'шт',
    qty: Number(qty || 0),
    contractor_price: Number(contractorPrice ?? source.price ?? 0),
    client_price: Number(clientPrice || 0),
    comment: comment || '',
    data: { catalog_snapshot: source.id ? source : null, catalog_loaded: catalogLoaded, ...data }
  };
}

function applyPrice(items) {
  const subtotal = draftItems.reduce((sum, item) => sum + item.qty * item.contractor_price, 0) + items.reduce((sum, item) => sum + item.qty * item.contractor_price, 0);
  const fallbackMarkup = autoMarkup(subtotal);
  return items.map((item) => {
    const snapshot = item.data?.catalog_snapshot;
    const rowMarkup = Number(snapshot?.markup_percent || 0) > 0 ? Number(snapshot.markup_percent) / 100 : fallbackMarkup;
    const defaultClient = snapshot?.default_client_price == null ? null : Number(snapshot.default_client_price);
    const minClient = Number(snapshot?.min_client_price || 0);
    const calculated = defaultClient || Math.ceil(item.contractor_price * (1 + rowMarkup));
    return { ...item, client_price: item.client_price > 0 ? item.client_price : Math.max(calculated, minClient), data: { ...item.data, auto_markup_fraction: rowMarkup } };
  });
}

function calcItem(raw, index = 0) {
  const qty = Number(raw.qty || 0);
  const contractorPrice = Number(raw.contractor_price || 0);
  const clientPrice = Number(raw.client_price || 0);
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  return {
    catalog_id: raw.catalog_id || null,
    category: raw.category || 'Расчёт',
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

function perimeter() {
  const w = inputNum('catCalcWidth');
  const h = inputNum('catCalcHeight');
  const qty = inputNum('catCalcQty') || 1;
  return w > 0 && h > 0 ? 2 * (w + h) * qty : 0;
}

function area() {
  return inputNum('catCalcWidth') * inputNum('catCalcHeight') * (inputNum('catCalcQty') || 1);
}

function currentItems() {
  const mode = inputValue('catCalcMode') || 'banner';
  const rows = [];
  if (mode === 'banner') {
    const material = catalogByName(inputValue('catCalcCatalog')) || catalogByGroup('banner')[0];
    const square = area();
    const per = perimeter();
    const step = inputNum('catCalcGrommetStep') || 0.3;
    if (square <= 0) return [];
    rows.push(makeItem(material, `${material.name} · ${inputNum('catCalcWidth')}×${inputNum('catCalcHeight')} м · ${inputNum('catCalcQty') || 1} шт`, square, `Площадь: ${square.toFixed(2)} м²`, { calculation_mode: 'banner', width: inputNum('catCalcWidth'), height: inputNum('catCalcHeight'), pieces: inputNum('catCalcQty') || 1 }));
    if (inputChecked('catCalcHemming') && per > 0) rows.push(makeItem(catalogByName('Проклейка баннера по краю'), 'Проклейка баннера по периметру', per, `Периметр: ${per.toFixed(2)} м`, { calculation_mode: 'banner_hemming' }));
    if (inputChecked('catCalcGrommets') && per > 0) {
      const count = Math.ceil(per / step);
      rows.push(makeItem(catalogByName('Установка люверсов'), `Люверсы по периметру, шаг ${step} м`, count, `Периметр: ${per.toFixed(2)} м, количество: ${count} шт`, { calculation_mode: 'banner_grommets', step }));
    }
    return applyPrice(rows);
  }
  if (mode === 'film') {
    const material = catalogByName(inputValue('catCalcCatalog')) || catalogByGroup('film')[0];
    const square = area();
    if (square <= 0) return [];
    rows.push(makeItem(material, `${material.name} · ${inputNum('catCalcWidth')}×${inputNum('catCalcHeight')} м · ${inputNum('catCalcQty') || 1} шт`, square, `Площадь: ${square.toFixed(2)} м²`, { calculation_mode: 'film' }));
    if (inputChecked('catCalcMountFilm')) rows.push(makeItem(catalogByName('Монтажная пленка'), 'Монтажная плёнка', square, `Площадь: ${square.toFixed(2)} м²`, { calculation_mode: 'mount_film' }));
    return applyPrice(rows);
  }
  if (mode === 'sheet') {
    const material = catalogByName(inputValue('catCalcCatalog')) || catalogByGroup('sheet')[0];
    const square = area();
    if (square <= 0) return [];
    return applyPrice([makeItem(material, `${material.name} · ${inputNum('catCalcWidth')}×${inputNum('catCalcHeight')} м · ${inputNum('catCalcQty') || 1} шт`, square, `Площадь: ${square.toFixed(2)} м²`, { calculation_mode: 'sheet' })]);
  }
  if (mode === 'photo') {
    const item = catalogByName(inputValue('catCalcCatalog')) || catalogByGroup('photo')[0];
    const qty = inputNum('catCalcQty') || 1;
    rows.push(makeItem(item, item.name, qty, `${qty} шт`, { calculation_mode: 'photo' }));
    if (inputChecked('catCalcLamination')) rows.push(makeItem(catalogByName('A4 ламинация'), 'A4 ламинация', qty, `${qty} шт`, { calculation_mode: 'photo_lamination' }));
    return applyPrice(rows);
  }
  const cost = inputNum('catCalcServiceCost');
  const client = inputNum('catCalcServiceClient');
  return [makeItem(null, inputValue('catCalcServiceName') || 'Услуга', 1, inputValue('catCalcComment'), { calculation_mode: mode }, client || Math.ceil(cost * (1 + autoMarkup(cost))), cost)];
}

function totals(items = draftItems, withRound = true) {
  let rows = items.map(calcItem);
  const settings = markupSettings();
  const clientRaw = rows.reduce((sum, item) => sum + item.client_sum, 0);
  const rounded = withRound && clientRaw > 0 ? Math.ceil(clientRaw / settings.roundStep) * settings.roundStep : clientRaw;
  const diff = Math.round((rounded - clientRaw) * 100) / 100;
  if (diff > 0) rows.push(calcItem(makeItem(null, `Округление итога до ${settings.roundStep} ₽`, 1, 'Автоматическое округление', { calculation_mode: 'rounding' }, diff, 0), rows.length));
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
  return { items: rows, contractor_cost: contractor, client_total: client, profit, margin_percent: margin, warnings, warning_level: warnings.length ? (profit < 0 ? 'critical' : 'warning') : 'ok' };
}

function needOptions() {
  const needs = v4State.leadNeeds || [];
  return `<option value="">Общий расчёт по заявке</option>${needs.filter((need) => need.status !== 'Архив').map((need) => `<option value="${esc(need.id)}">${esc(need.title || need.need_type || 'Потребность')}</option>`).join('')}`;
}

function modeOptions(selected = 'banner') {
  const modes = [['banner', 'Баннер'], ['film', 'Плёнка / наклейки'], ['sheet', 'ПВХ / листовой материал'], ['photo', 'Фото A4'], ['service', 'Дизайн / монтаж / доставка']];
  return modes.map(([value, label]) => `<button type="button" class="${selected === value ? 'is-active' : ''}" data-cat-calc-mode="${value}">${label}</button>`).join('');
}

function renderModeFields(mode = 'banner') {
  if (mode === 'banner') return `
    <div class="v4-form-grid">
      <label>Материал баннера<select id="catCalcCatalog">${catalogOptions('banner', 'Баннер 340/440 — стандарт')}</select></label>
      <label>Ширина, м<input id="catCalcWidth" type="number" min="0" step="0.01" placeholder="3"></label>
      <label>Высота, м<input id="catCalcHeight" type="number" min="0" step="0.01" placeholder="2"></label>
      <label>Количество, шт<input id="catCalcQty" type="number" min="1" step="1" value="1"></label>
      <label>Шаг люверсов, м<input id="catCalcGrommetStep" type="number" min="0.1" step="0.05" value="0.3"></label>
    </div>
    <div class="v4-option-row"><label><input id="catCalcHemming" type="checkbox"> Проклейка по периметру</label><label><input id="catCalcGrommets" type="checkbox"> Люверсы по периметру</label></div>`;
  if (mode === 'film') return `
    <div class="v4-form-grid">
      <label>Материал плёнки<select id="catCalcCatalog">${catalogOptions('film', 'Самоклеящаяся пленка (мат/гл/прозр.)')}</select></label>
      <label>Ширина, м<input id="catCalcWidth" type="number" min="0" step="0.01"></label>
      <label>Высота, м<input id="catCalcHeight" type="number" min="0" step="0.01"></label>
      <label>Количество, шт<input id="catCalcQty" type="number" min="1" step="1" value="1"></label>
    </div>
    <div class="v4-option-row"><label><input id="catCalcMountFilm" type="checkbox"> Добавить монтажную плёнку</label></div>`;
  if (mode === 'sheet') return `
    <div class="v4-form-grid">
      <label>Материал<select id="catCalcCatalog">${catalogOptions('sheet', 'ПВХ вспененный 3 мм')}</select></label>
      <label>Ширина, м<input id="catCalcWidth" type="number" min="0" step="0.01"></label>
      <label>Высота, м<input id="catCalcHeight" type="number" min="0" step="0.01"></label>
      <label>Количество, шт<input id="catCalcQty" type="number" min="1" step="1" value="1"></label>
    </div>`;
  if (mode === 'photo') return `
    <div class="v4-form-grid"><label>Позиция<select id="catCalcCatalog">${catalogOptions('photo', 'A4 фото (одна сторона)')}</select></label><label>Количество, шт<input id="catCalcQty" type="number" min="1" step="1" value="1"></label></div>
    <div class="v4-option-row"><label><input id="catCalcLamination" type="checkbox"> Добавить ламинацию A4</label></div>`;
  return `
    <div class="v4-form-grid">
      <label>Услуга<select id="catCalcServiceName"><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Выезд / замер</option><option>Другое</option></select></label>
      <label>Себестоимость, ₽<input id="catCalcServiceCost" type="number" min="0" step="1" value="0"></label>
      <label>Цена клиенту, ₽<input id="catCalcServiceClient" type="number" min="0" step="1" value="0"></label>
      <label>Комментарий<input id="catCalcComment" placeholder="Что входит в услугу"></label>
    </div>`;
}

function renderExistingCalcs() {
  const calcs = v4State.calculations || [];
  if (v4State.calculationsBusy) return '<div class="v4-empty">Загружаю сохранённые расчёты...</div>';
  if (v4State.calculationsError) return `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>`;
  if (!calcs.length) return '<div class="v4-empty">Сохранённых расчётов пока нет.</div>';
  return calcs.map((calc) => `<article class="v4-calc-card"><div class="v4-calc-title-row"><h4>${esc(calc.title || 'Расчёт')}</h4><span>${esc(calc.status || 'Черновик')}</span></div><div class="v4-calc-totals"><span><b>Клиенту:</b> ${money(calc.client_total)}</span><span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span><span><b>Прибыль:</b> ${money(calc.profit)}</span><span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span></div></article>`).join('');
}

function renderPreview() {
  const box = byId('catCalcPreview');
  if (!box) return;
  const rows = currentItems();
  if (!rows.length) {
    box.className = 'v4-calc-live is-warn';
    box.innerHTML = '<em>Заполните поля — расчёт появится автоматически.</em>';
    return;
  }
  const result = totals(rows, false);
  box.className = `v4-calc-live ${result.profit < 0 ? 'is-error' : result.margin_percent < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `<span><b>Справочник:</b> ${catalogLoaded ? 'из базы' : 'резервный'}</span><span><b>Клиенту:</b> ${money(result.client_total)}</span><span><b>Себестоимость:</b> ${money(result.contractor_cost)}</span><span><b>Прибыль:</b> ${money(result.profit)}</span><span><b>Маржа:</b> ${Math.round(result.margin_percent)}%</span><div class="v4-estimate-lines">${result.items.map((item) => `<div><b>${esc(item.name)}</b><span>${Number(item.qty).toLocaleString('ru-RU')} ${esc(item.unit)} · подрядчик ${money(item.contractor_sum)} · клиент ${money(item.client_sum)}</span></div>`).join('')}</div>`;
}

function renderDraft() {
  const tbody = byId('catCalcDraftItems');
  const totalsBox = byId('catCalcTotals');
  const guide = byId('catCalcGuide');
  if (!tbody || !totalsBox || !guide) return;
  tbody.innerHTML = draftItems.length ? draftItems.map((raw, index) => {
    const item = calcItem(raw, index);
    return `<tr><td>${esc(item.name)}${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</td><td>${esc(item.unit)}</td><td>${Number(item.qty).toLocaleString('ru-RU')}</td><td>${money(item.contractor_price)}</td><td>${money(item.client_price)}</td><td>${money(item.client_sum)}</td><td><button type="button" data-cat-calc-remove="${index}">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="7">Добавьте первую позицию.</td></tr>';
  const result = totals(draftItems, true);
  totalsBox.className = `v4-calc-totals v4-calc-total-panel ${result.warning_level === 'ok' ? 'is-good' : 'is-warn'}`;
  totalsBox.innerHTML = `<span><b>Клиенту:</b> ${money(result.client_total)}</span><span><b>Себестоимость:</b> ${money(result.contractor_cost)}</span><span><b>Прибыль:</b> ${money(result.profit)}</span><span><b>Маржа:</b> ${Math.round(result.margin_percent)}%</span>`;
  guide.innerHTML = result.warnings.length ? `<div class="v4-calc-warnings">Проверьте: ${result.warnings.map(esc).join(', ')}</div>` : '<div class="v4-calc-ok">Расчёт можно сохранять и формировать КП.</div>';
  renderPreview();
}

function renderCalculator() {
  const box = byId('calculationsBox');
  if (!box || !v4State.route.leadId) return;
  const mode = byId('catCalcMode')?.value || 'banner';
  box.innerHTML = `
    <section class="v4-subcard v4-calculations-section" data-catalog-calculator="1">
      <div class="v4-subcard-head"><div><h3>Расчёты</h3><p>Новый расчёт берёт цены из таблицы leader_catalog. Для баннера проклейка и люверсы считаются автоматически.</p></div><span class="v4-muted">${catalogLoaded ? `Справочник: ${catalog.length} позиций` : 'Справочник: резервный'}</span></div>
      <div class="v4-calculations-list">${renderExistingCalcs()}</div>
      <div class="v4-calc-form">
        <div class="v4-form-grid"><label>Название расчёта<input id="catCalcTitle" placeholder="Например: Баннер 3×2 с люверсами"></label><label>Потребность<select id="catCalcNeedId">${needOptions()}</select></label><label>Комментарий для клиента<input id="catCalcPublicComment" placeholder="Что входит в стоимость"></label></div>
        <div class="v4-calc-auto-box"><h4>Тип позиции</h4><div class="v4-mode-buttons">${modeOptions(mode)}</div><input id="catCalcMode" type="hidden" value="${esc(mode)}"><div id="catCalcFields">${renderModeFields(mode)}</div><details class="v4-calc-settings"><summary>Наценка и округление</summary><div class="v4-form-grid"><label>Фиксированная наценка, %<input id="catCalcMarkup" placeholder="пусто = авто"></label><label>Мелкий заказ до, ₽<input id="catCalcSmallLimit" type="number" value="3000"></label><label>Наценка мелкий, %<input id="catCalcSmallMarkup" type="number" value="30"></label><label>Средний заказ до, ₽<input id="catCalcMedLimit" type="number" value="10000"></label><label>Наценка средний, %<input id="catCalcMedMarkup" type="number" value="20"></label><label>Наценка крупный, %<input id="catCalcLargeMarkup" type="number" value="10"></label><label>Шаг округления, ₽<input id="catCalcRoundStep" type="number" value="10"></label></div></details><div id="catCalcPreview" class="v4-calc-live"></div><div class="v4-form-actions"><button id="catCalcAddBtn" type="button" class="v4-primary">Добавить в расчёт</button></div></div>
        <div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма клиенту</th><th></th></tr></thead><tbody id="catCalcDraftItems"></tbody></table></div><div id="catCalcTotals" class="v4-calc-totals"></div><div id="catCalcGuide"></div><div class="v4-form-actions"><button id="catCalcSaveBtn" type="button" class="v4-primary">Сохранить расчёт</button><button id="catCalcClearBtn" type="button">Очистить</button></div>
      </div>
    </section>`;
  renderDraft();
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderCalculator, 30);
}

function addCurrentItems() {
  const rows = currentItems();
  if (!rows.length) {
    toast('Заполните параметры позиции');
    return;
  }
  const invalid = rows.map(calcItem).filter((item) => item.client_sum <= 0 || item.profit < 0 || item.qty <= 0);
  if (invalid.length) {
    toast('Позиция не должна быть нулевой или убыточной');
    return;
  }
  draftItems.push(...rows);
  const title = byId('catCalcTitle');
  if (title && !title.value.trim()) title.value = rows[0].name;
  renderDraft();
  toast(`Добавлено позиций: ${rows.length}`);
}

async function syncLeadAfterCalculation() {
  const lead = v4State.currentLead;
  if (!lead?.id || ['КП отправлено', 'Согласовано', 'Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '')) return null;
  const response = await supabaseClient.from('leader_leads').update({ status: 'Расчёт подготовлен', updated_at: new Date().toISOString() }).eq('id', lead.id).select('*').single();
  if (response.error) return null;
  return response.data;
}

async function saveCalculation() {
  if (saving || !v4State.route.leadId) return;
  const result = totals(draftItems, true);
  if (!draftItems.length || result.client_total <= 0 || result.profit < 0) {
    toast('Проверьте расчёт перед сохранением');
    return;
  }
  saving = true;
  const title = inputValue('catCalcTitle') || 'Расчёт по заявке';
  let createdId = null;
  try {
    setStatus('Сохраняю расчёт...', 'warn');
    const calcResponse = await timeout(supabaseClient.from('leader_lead_calculations').insert({
      lead_id: v4State.route.leadId,
      need_id: inputValue('catCalcNeedId') || null,
      client_id: v4State.currentLead?.converted_client_id || null,
      title,
      status: 'Черновик',
      version_number: (v4State.calculations || []).length + 1,
      client_total: result.client_total,
      contractor_cost: result.contractor_cost,
      profit: result.profit,
      margin_percent: result.margin_percent,
      warning_level: result.warning_level,
      warnings: result.warnings,
      public_comment: inputValue('catCalcPublicComment'),
      internal_comment: '',
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    }).select(CALC_FIELDS).single(), 14000, 'Расчёт не сохранился за 14 секунд');
    if (calcResponse.error) throw calcResponse.error;
    const calc = calcResponse.data;
    createdId = calc.id;
    const itemPayloads = result.items.map((item) => ({ ...item, calculation_id: calc.id, lead_id: v4State.route.leadId }));
    const itemResponse = await timeout(supabaseClient.from('leader_lead_calculation_items').insert(itemPayloads).select(ITEM_FIELDS), 14000, 'Позиции расчёта не сохранились за 14 секунд');
    if (itemResponse.error) throw itemResponse.error;
    const updatedLead = await syncLeadAfterCalculation();
    setState({
      calculations: [calc, ...(v4State.calculations || [])],
      currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
      leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
    });
    draftItems = [];
    renderCalculator();
    setStatus('Расчёт сохранён. Можно формировать КП.', 'good');
    toast('Расчёт сохранён');
  } catch (error) {
    if (createdId) await supabaseClient.from('leader_lead_calculations').delete().eq('id', createdId);
    setStatus(`Ошибка сохранения расчёта: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    saving = false;
  }
}

function bindEvents() {
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    const mode = event.target.closest('button[data-cat-calc-mode]');
    if (mode) {
      const input = byId('catCalcMode');
      if (input) input.value = mode.dataset.catCalcMode;
      renderCalculator();
      return;
    }
    if (event.target.closest('#catCalcAddBtn')) addCurrentItems();
    if (event.target.closest('#catCalcClearBtn')) { draftItems = []; renderDraft(); }
    if (event.target.closest('#catCalcSaveBtn')) await saveCalculation();
    const remove = event.target.closest('button[data-cat-calc-remove]');
    if (remove) { draftItems.splice(Number(remove.dataset.catCalcRemove), 1); renderDraft(); }
  });
  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target.closest('[data-catalog-calculator]')) renderPreview();
  });
  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target.closest('[data-catalog-calculator]')) renderPreview();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => { loadCatalog(); scheduleRender(); });
  document.addEventListener('leader-v4:crm-ready', () => { loadCatalog(); scheduleRender(); });
  document.addEventListener('leader-v4:route-change', () => { draftItems = []; scheduleRender(); });
  subscribeState(() => scheduleRender());
}

bindEvents();
loadCatalog();
scheduleRender();
