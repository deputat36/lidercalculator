import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

const CATALOG = [
  { category: 'Широкоформатная печать', name: 'Баннер 340/440 — стандарт', unit: 'м²', price: 350 },
  { category: 'Широкоформатная печать', name: 'Баннер 340/440 — устойчивая печать', unit: 'м²', price: 450 },
  { category: 'Широкоформатная печать', name: 'Самоклеящаяся пленка (мат/гл/прозр.)', unit: 'м²', price: 550 },
  { category: 'Широкоформатная печать', name: 'Перфорированная пленка (OWV)', unit: 'м²', price: 750 },
  { category: 'Услуги по баннерам', name: 'Установка люверсов', unit: 'шт', price: 15 },
  { category: 'Услуги по баннерам', name: 'Проклейка баннера по краю', unit: 'м', price: 30 },
  { category: 'Услуги по баннерам', name: 'Склейка швов/карман', unit: 'м', price: 60 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 3 мм', unit: 'м²', price: 1400 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 4 мм', unit: 'м²', price: 1800 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 5 мм', unit: 'м²', price: 2150 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 6 мм', unit: 'м²', price: 2650 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 8 мм', unit: 'м²', price: 3800 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 10 мм', unit: 'м²', price: 4400 },
  { category: 'Пленка и листовые материалы', name: 'Железо (листовой металл)', unit: 'м²', price: 1500 },
  { category: 'Пленка и листовые материалы', name: 'Самоклеящаяся мономерная пленка', unit: 'м²', price: 700 },
  { category: 'Пленка и листовые материалы', name: 'Монтажная пленка', unit: 'м²', price: 300 },
  { category: 'Печать фото', name: 'A4 фото (одна сторона)', unit: 'шт', price: 40 },
  { category: 'Печать фото', name: 'A4 ламинация', unit: 'шт', price: 40 }
];

const MODES = [
  ['banner', 'Баннер'],
  ['film', 'Плёнка / наклейки'],
  ['sheet', 'ПВХ / листовой материал'],
  ['photo', 'Фото A4'],
  ['service', 'Дизайн / монтаж / доставка'],
  ['custom', 'Ручная позиция']
];

let draftItems = [];
let saveBusy = false;

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

function num(id) {
  return parseNum(byId(id)?.value || '');
}

function val(id) {
  return byId(id)?.value?.trim() || '';
}

function checked(id) {
  return Boolean(byId(id)?.checked);
}

function catalogByName(name) {
  return CATALOG.find((item) => item.name === name) || null;
}

function catalogOptions(filter, selected = '') {
  return CATALOG.filter(filter).map((item) => `<option value="${esc(item.name)}" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.price)} / ${esc(item.unit)}</option>`).join('');
}

function markupFractionFromInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = parseNum(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function calcSettings() {
  return {
    manualMarkup: markupFractionFromInput(byId('calcMarkup')?.value),
    smallLimit: num('calcSmallLimit') || 3000,
    smallMarkup: markupFractionFromInput(byId('calcSmallMarkup')?.value) ?? 0.30,
    medLimit: num('calcMedLimit') || 10000,
    medMarkup: markupFractionFromInput(byId('calcMedMarkup')?.value) ?? 0.20,
    largeMarkup: markupFractionFromInput(byId('calcLargeMarkup')?.value) ?? 0.10,
    roundStep: Math.max(1, num('calcRoundStep') || 10)
  };
}

function autoMarkupBySubtotal(subtotal, settings = calcSettings()) {
  if (settings.manualMarkup !== null) return settings.manualMarkup;
  if (subtotal <= settings.smallLimit) return settings.smallMarkup;
  if (subtotal <= settings.medLimit) return settings.medMarkup;
  return settings.largeMarkup;
}

function makeRawItem({ category, itemType, name, unit, qty, contractorPrice, clientPrice, comment, data }) {
  return {
    category: category || 'Расчёт по позиции',
    item_type: itemType || 'Услуга',
    name: name || 'Позиция расчёта',
    unit: unit || 'шт',
    qty: Number(qty || 0),
    contractor_price: Number(contractorPrice || 0),
    client_price: Number(clientPrice || 0),
    comment: comment || '',
    data: data || {}
  };
}

function applyAutoPrice(rows) {
  const settings = calcSettings();
  const currentContractor = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const newContractor = rows.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = autoMarkupBySubtotal(currentContractor + newContractor, settings);
  return rows.map((item) => ({
    ...item,
    client_price: Number(item.client_price || 0) > 0 ? Number(item.client_price || 0) : Math.ceil(Number(item.contractor_price || 0) * (1 + markup)),
    data: { ...(item.data || {}), auto_markup_fraction: markup }
  }));
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
    category: raw.category || 'Расчёт по позиции',
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
    data: raw.data || {},
    sort_order: index + 1
  };
}

function itemsWithRoundAdjustment(items) {
  const settings = calcSettings();
  const base = items.map(calcItem);
  const clientRaw = base.reduce((sum, item) => sum + item.client_sum, 0);
  const rounded = settings.roundStep > 1 ? Math.ceil(clientRaw / settings.roundStep) * settings.roundStep : clientRaw;
  const diff = Math.round((rounded - clientRaw) * 100) / 100;
  if (diff > 0) {
    return [...items, makeRawItem({
      category: 'Округление',
      itemType: 'Корректировка',
      name: `Округление итога до шага ${settings.roundStep} ₽`,
      unit: 'услуга',
      qty: 1,
      contractorPrice: 0,
      clientPrice: diff,
      comment: 'Автоматическое округление итоговой суммы',
      data: { calculation_mode: 'rounding', round_step: settings.roundStep }
    })];
  }
  return items;
}

function totals(items = draftItems, withRounding = false) {
  const sourceItems = withRounding ? itemsWithRoundAdjustment(items) : items;
  const calculated = sourceItems.map(calcItem);
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
    rawItems: sourceItems,
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
  if (current && ![...select.options].some((option) => option.value === current)) select.value = '';
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

function modeOptions(selected = 'banner') {
  return MODES.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function renderModeButtons(selected = 'banner') {
  return MODES.map(([value, label]) => `<button type="button" class="${value === selected ? 'is-active' : ''}" data-calc-mode="${esc(value)}">${esc(label)}</button>`).join('');
}

function renderModeFields(mode = 'banner') {
  if (mode === 'banner') {
    return `
      <div class="v4-form-grid">
        <label>Материал баннера
          <select id="calcCatalogItem">${catalogOptions((item) => item.name.includes('Баннер'), 'Баннер 340/440 — стандарт')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="3">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="2">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
        <label>Шаг люверсов, м
          <input id="calcGrommetStep" type="number" min="0.1" step="0.05" value="0.3">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedHemming" type="checkbox"> Проклейка по периметру</label>
        <label><input id="calcNeedGrommets" type="checkbox"> Люверсы по периметру</label>
      </div>
    `;
  }
  if (mode === 'film') {
    return `
      <div class="v4-form-grid">
        <label>Материал плёнки
          <select id="calcCatalogItem">${catalogOptions((item) => item.name.includes('плен') || item.name.includes('Плен') || item.name.includes('OWV'), 'Самоклеящаяся пленка (мат/гл/прозр.)')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedMountFilm" type="checkbox"> Добавить монтажную плёнку</label>
      </div>
    `;
  }
  if (mode === 'sheet') {
    return `
      <div class="v4-form-grid">
        <label>Материал
          <select id="calcCatalogItem">${catalogOptions((item) => item.category === 'Пленка и листовые материалы' && !item.name.includes('пленка') && !item.name.includes('пленки'), 'ПВХ вспененный 3 мм')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
    `;
  }
  if (mode === 'photo') {
    return `
      <div class="v4-form-grid">
        <label>Позиция
          <select id="calcCatalogItem">${catalogOptions((item) => item.category === 'Печать фото', 'A4 фото (одна сторона)')}</select>
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedLamination" type="checkbox"> Добавить ламинацию A4</label>
      </div>
    `;
  }
  if (mode === 'service') {
    return `
      <div class="v4-form-grid">
        <label>Тип услуги
          <select id="calcServiceName"><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Выезд / замер</option><option>Другое</option></select>
        </label>
        <label>Себестоимость / подрядчик, ₽
          <input id="calcServiceCost" type="number" min="0" step="1" value="0">
        </label>
        <label>Цена клиенту, ₽
          <input id="calcServiceClient" type="number" min="0" step="1" value="0">
        </label>
        <label>Комментарий
          <input id="calcServiceComment" placeholder="Например: монтаж на объекте клиента">
        </label>
      </div>
    `;
  }
  return `
    <div class="v4-form-grid">
      <label>Название позиции
        <input id="calcCustomName" placeholder="Например: сложная вывеска / нестандартная работа">
      </label>
      <label>Ед.
        <select id="calcCustomUnit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option></select>
      </label>
      <label>Количество
        <input id="calcCustomQty" type="number" min="0" step="0.01" value="1">
      </label>
      <label>Себестоимость за ед.
        <input id="calcCustomCost" type="number" min="0" step="1" value="0">
      </label>
      <label>Цена клиенту за ед.
        <input id="calcCustomClient" type="number" min="0" step="1" value="0">
      </label>
      <label>Комментарий
        <input id="calcCustomComment" placeholder="Что входит в позицию">
      </label>
    </div>
  `;
}

function area() {
  return num('calcWidth') * num('calcHeight') * (num('calcQty') || 1);
}

function perimeterTotal() {
  const w = num('calcWidth');
  const h = num('calcHeight');
  const qty = num('calcQty') || 1;
  return w > 0 && h > 0 ? 2 * (w + h) * qty : 0;
}

function currentModeItems() {
  const mode = val('calcSmartMode') || 'banner';
  const rows = [];
  if (mode === 'banner') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('Баннер 340/440 — стандарт');
    const units = area();
    const per = perimeterTotal();
    const step = num('calcGrommetStep') || 0.3;
    if (units <= 0) return [];
    rows.push(makeRawItem({
      category: material.category,
      itemType: 'Баннер',
      name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`,
      unit: material.unit,
      qty: units,
      contractorPrice: material.price,
      comment: `Площадь: ${units.toFixed(2)} м²`,
      data: { calculation_mode: 'banner', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 }
    }));
    if (checked('calcNeedHemming') && per > 0) {
      const hem = catalogByName('Проклейка баннера по краю');
      rows.push(makeRawItem({ category: hem.category, itemType: 'Доп. услуга', name: 'Проклейка баннера по периметру', unit: hem.unit, qty: per, contractorPrice: hem.price, comment: `Периметр всего: ${per.toFixed(2)} м`, data: { calculation_mode: 'banner_hemming' } }));
    }
    if (checked('calcNeedGrommets') && per > 0) {
      const grommet = catalogByName('Установка люверсов');
      const count = Math.ceil(per / step);
      rows.push(makeRawItem({ category: grommet.category, itemType: 'Доп. услуга', name: `Люверсы по периметру, шаг ${step} м`, unit: grommet.unit, qty: count, contractorPrice: grommet.price, comment: `Расчёт: ${per.toFixed(2)} м / ${step} м = ${count} шт`, data: { calculation_mode: 'banner_grommets', step } }));
    }
    return applyAutoPrice(rows);
  }
  if (mode === 'film') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('Самоклеящаяся пленка (мат/гл/прозр.)');
    const units = area();
    if (units <= 0) return [];
    rows.push(makeRawItem({ category: material.category, itemType: 'Плёнка', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, unit: material.unit, qty: units, contractorPrice: material.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'film', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));
    if (checked('calcNeedMountFilm')) {
      const mount = catalogByName('Монтажная пленка');
      rows.push(makeRawItem({ category: mount.category, itemType: 'Доп. материал', name: 'Монтажная плёнка', unit: mount.unit, qty: units, contractorPrice: mount.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'mount_film' } }));
    }
    return applyAutoPrice(rows);
  }
  if (mode === 'sheet') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('ПВХ вспененный 3 мм');
    const units = area();
    if (units <= 0) return [];
    rows.push(makeRawItem({ category: material.category, itemType: 'Листовой материал', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, unit: material.unit, qty: units, contractorPrice: material.price, comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'sheet', width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));
    return applyAutoPrice(rows);
  }
  if (mode === 'photo') {
    const item = catalogByName(val('calcCatalogItem')) || catalogByName('A4 фото (одна сторона)');
    const qty = num('calcQty') || 1;
    rows.push(makeRawItem({ category: item.category, itemType: 'Фото', name: item.name, unit: item.unit, qty, contractorPrice: item.price, comment: `${qty} шт`, data: { calculation_mode: 'photo' } }));
    if (checked('calcNeedLamination')) {
      const lam = catalogByName('A4 ламинация');
      rows.push(makeRawItem({ category: lam.category, itemType: 'Доп. услуга', name: lam.name, unit: lam.unit, qty, contractorPrice: lam.price, comment: `${qty} шт`, data: { calculation_mode: 'photo_lamination' } }));
    }
    return applyAutoPrice(rows);
  }
  if (mode === 'service') {
    const cost = num('calcServiceCost');
    const client = num('calcServiceClient');
    return [makeRawItem({ category: 'Услуги', itemType: 'Услуга', name: val('calcServiceName') || 'Услуга', unit: 'услуга', qty: 1, contractorPrice: cost, clientPrice: client || Math.ceil(cost * (1 + autoMarkupBySubtotal(cost))), comment: val('calcServiceComment'), data: { calculation_mode: 'service' } })];
  }
  const customCost = num('calcCustomCost');
  const customClient = num('calcCustomClient');
  return [makeRawItem({ category: 'Ручная позиция', itemType: 'Услуга', name: val('calcCustomName') || 'Ручная позиция', unit: val('calcCustomUnit') || 'шт', qty: num('calcCustomQty') || 1, contractorPrice: customCost, clientPrice: customClient || Math.ceil(customCost * (1 + autoMarkupBySubtotal(customCost))), comment: val('calcCustomComment'), data: { calculation_mode: 'custom' } })];
}

function renderSmartPreview() {
  const box = byId('calcSmartPreview');
  if (!box) return;
  const rows = currentModeItems();
  if (!rows.length) {
    box.className = 'v4-calc-live is-warn';
    box.innerHTML = '<em>Заполните размеры, количество или стоимость — расчёт появится автоматически.</em>';
    return;
  }
  const calculated = rows.map(calcItem);
  const contractor = calculated.reduce((sum, item) => sum + item.contractor_sum, 0);
  const client = calculated.reduce((sum, item) => sum + item.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  box.className = `v4-calc-live ${profit < 0 ? 'is-error' : margin < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `
    <span><b>Позиций:</b> ${calculated.length}</span>
    <span><b>Себестоимость:</b> ${money(contractor)}</span>
    <span><b>Клиенту:</b> ${money(client)}</span>
    <span><b>Прибыль:</b> ${money(profit)}</span>
    <span><b>Маржа:</b> ${Math.round(margin)}%</span>
    <div class="v4-estimate-lines">${calculated.map((item) => `<div><b>${esc(item.name)}</b><span>${Number(item.qty).toLocaleString('ru-RU')} ${esc(item.unit)} · подрядчик ${money(item.contractor_sum)} · клиент ${money(item.client_sum)}</span></div>`).join('')}</div>
  `;
}

function renderDraftItems() {
  const list = byId('calcDraftItems');
  const totalBox = byId('calcDraftTotals');
  const guideBox = byId('calcDraftGuide');
  if (!list || !totalBox) return;
  const result = totals(draftItems, true);
  const visible = draftItems.map(calcItem);
  list.innerHTML = visible.length ? visible.map((item, index) => `
    <tr>
      <td>${esc(item.name)}${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</td>
      <td>${esc(item.unit)}</td>
      <td>${Number(item.qty).toLocaleString('ru-RU')}</td>
      <td>${money(item.contractor_price)}</td>
      <td>${money(item.client_price)}</td>
      <td>${money(item.client_sum)}</td>
      <td><button type="button" data-action="remove-calc-item" data-index="${index}">×</button></td>
    </tr>
  `).join('') : '<tr><td colspan="7">Позиции пока не добавлены. Выберите тип позиции выше, заполните поля и нажмите «Добавить в расчёт».</td></tr>';
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
      : '<div class="v4-calc-ok">Расчёт можно сохранять. КП сформируется из клиентских сумм, себестоимость клиенту не покажется.</div>';
  }
  renderSmartPreview();
}

function renderCalcForm() {
  const selectedMode = byId('calcSmartMode')?.value || 'banner';
  return `
    <div class="v4-calc-form">
      <div class="v4-calc-wizard-head">
        <div>
          <h4>Новый расчёт</h4>
          <p>Выберите тип позиции. Поля и формулы подстроятся под задачу: баннер считается по площади, проклейка по периметру, люверсы по шагу.</p>
        </div>
        <div class="v4-calc-steps"><span>1. Тип позиции</span><span>2. Авторасчёт</span><span>3. КП</span></div>
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
      <div class="v4-calc-auto-box">
        <h4>Тип позиции</h4>
        <div class="v4-mode-buttons">${renderModeButtons(selectedMode)}</div>
        <label class="v4-mode-select">Текущий тип
          <select id="calcSmartMode">${modeOptions(selectedMode)}</select>
        </label>
        <div id="calcModeFields">${renderModeFields(selectedMode)}</div>
        <details class="v4-calc-settings">
          <summary>Наценка и округление</summary>
          <div class="v4-form-grid">
            <label>Фиксированная наценка, %
              <input id="calcMarkup" placeholder="пусто = авто">
            </label>
            <label>Мелкий заказ до, ₽
              <input id="calcSmallLimit" type="number" value="3000">
            </label>
            <label>Наценка мелкий, %
              <input id="calcSmallMarkup" type="number" value="30">
            </label>
            <label>Средний заказ до, ₽
              <input id="calcMedLimit" type="number" value="10000">
            </label>
            <label>Наценка средний, %
              <input id="calcMedMarkup" type="number" value="20">
            </label>
            <label>Наценка крупный, %
              <input id="calcLargeMarkup" type="number" value="10">
            </label>
            <label>Шаг округления итога, ₽
              <input id="calcRoundStep" type="number" value="10">
            </label>
          </div>
        </details>
        <div id="calcSmartPreview" class="v4-calc-live"></div>
        <div class="v4-form-actions">
          <button id="addSmartCalcItemBtn" type="button" class="v4-primary">Добавить в расчёт</button>
        </div>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table">
          <thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма клиенту</th><th></th></tr></thead>
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
          <p>Расчёт теперь адаптируется под позицию. Для баннера достаточно указать размер и опции, дополнительные строки создаются автоматически.</p>
        </div>
        <span class="v4-muted">Расчётов: ${calculations.length}</span>
      </div>
      <div class="v4-calculations-list">
        ${v4State.calculationsError ? `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>` : calculations.length ? calculations.map(renderCalcCard).join('') : '<div class="v4-empty">Расчётов пока нет. Начните с типа позиции: например, баннер или плёнка.</div>'}
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

function addSmartItems() {
  const items = currentModeItems();
  if (!items.length) {
    toast('Заполните поля расчёта позиции');
    return;
  }
  const invalid = items.map(calcItem).filter((item) => item.client_sum <= 0 || item.profit < 0 || item.qty <= 0);
  if (invalid.length) {
    toast('Проверьте позицию: сумма клиенту должна быть больше 0, расчёт не должен быть убыточным');
    return;
  }
  draftItems.push(...items);
  if (!val('calcTitle')) {
    const title = items[0]?.name || 'Расчёт по заявке';
    const titleInput = byId('calcTitle');
    if (titleInput) titleInput.value = title;
  }
  renderDraftItems();
  toast(`Добавлено позиций: ${items.length}`);
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

async function syncLeadAfterCalculation() {
  const lead = v4State.currentLead;
  if (!lead?.id) return null;
  if (['КП отправлено', 'Согласовано', 'Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '')) return null;
  const response = await supabaseClient
    .from('leader_leads')
    .update({ status: 'Расчёт подготовлен', updated_at: new Date().toISOString() })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (response.error) return null;
  return response.data;
}

async function saveCalculation() {
  if (!v4State.route.leadId || saveBusy) return;
  const result = totals(draftItems, true);
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
    const itemPayloads = result.rawItems.map((raw, index) => ({ ...calcItem(raw, index), calculation_id: calc.id, lead_id: v4State.route.leadId }));
    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .insert(itemPayloads)
        .select(ITEM_FIELDS),
      14000,
      'Позиции расчёта не сохранились за 14 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;
    const updatedLead = await syncLeadAfterCalculation();
    setState({
      calculations: [calc, ...(v4State.calculations || [])],
      currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
      leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
    });
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

function setCalcMode(mode) {
  const select = byId('calcSmartMode');
  if (select) select.value = mode;
  const fields = byId('calcModeFields');
  if (fields) fields.innerHTML = renderModeFields(mode);
  document.querySelectorAll('button[data-calc-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.calcMode === mode));
  renderSmartPreview();
}

function bindCalculationEvents() {
  byId('leadCardSection')?.addEventListener('click', (event) => {
    const modeButton = event.target.closest('button[data-calc-mode]');
    if (modeButton) {
      setCalcMode(modeButton.dataset.calcMode);
      return;
    }
    if (event.target.closest('#addSmartCalcItemBtn')) addSmartItems();
    if (event.target.closest('#clearCalculationBtn')) {
      draftItems = [];
      renderCalculations();
    }
    if (event.target.closest('#saveCalculationBtn')) saveCalculation();
    const remove = event.target.closest('button[data-action="remove-calc-item"]');
    if (remove) {
      draftItems.splice(Number(remove.dataset.index), 1);
      renderDraftItems();
    }
  });
  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target.closest('#calcSmartMode')) setCalcMode(event.target.value);
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
  });
  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
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
