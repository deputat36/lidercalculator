import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';

let items = [];
let busy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function num(value) {
  const n = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function val(id) { return byId(id)?.value?.trim() || ''; }
function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`; }
function circleArea(dCm, qty) { const r = (dCm / 100) / 2; return Math.PI * r * r * qty; }
function round2(value) { return Math.round(Number(value || 0) * 100) / 100; }
function autoClient(cost) {
  const c = Number(cost || 0);
  if (c <= 0) return 0;
  const k = c < 3000 ? 1.9 : c < 15000 ? 1.55 : 1.35;
  return Math.ceil(c * k / 10) * 10;
}
function parseList(text) {
  return String(text || '').replace(/шт/gi, '').split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean);
}
function parsePairs(text) {
  return parseList(text).map((raw) => {
    const s = raw.replace('×', 'x').replace('*', 'x').replace('-', 'x');
    const [a, b] = s.split('x').map((x) => x?.trim());
    return { name: a || raw, qty: num(b || 1) || 1, raw };
  }).filter((x) => x.name && x.qty > 0);
}
function parseDiameters(text) {
  return parsePairs(text).map((x) => ({ diameter: num(x.name), qty: x.qty, raw: x.raw })).filter((x) => x.diameter > 0);
}
function calcRow(raw, index = 0) {
  const qty = Number(raw.qty || 0);
  const contractorPrice = Number(raw.contractor_price || 0);
  const clientPrice = Number(raw.client_price || 0);
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  return {
    ...raw,
    contractor_sum: contractorSum,
    client_sum: clientSum,
    profit,
    markup_percent: contractorSum > 0 ? (profit / contractorSum) * 100 : 0,
    margin_percent: clientSum > 0 ? (profit / clientSum) * 100 : 0,
    sort_order: index + 1
  };
}
function totals() {
  const rows = items.map(calcRow);
  const contractor = rows.reduce((sum, row) => sum + row.contractor_sum, 0);
  const client = rows.reduce((sum, row) => sum + row.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!rows.length) warnings.push('нет позиций');
  if (client <= 0) warnings.push('сумма клиенту 0');
  if (profit < 0) warnings.push('убыток');
  if (client > 0 && margin < 20) warnings.push('маржа ниже 20%');
  return { rows, contractor, client, profit, margin, warnings };
}
function make({ category = 'Ручная позиция', type = 'Услуга', name = 'Позиция', unit = 'шт', qty = 1, cost = 0, client = 0, comment = '', data = {} }) {
  return {
    catalog_id: null,
    category,
    item_type: type,
    name,
    unit,
    qty: Number(qty || 0),
    contractor_price: Number(cost || 0),
    client_price: Number(client || autoClient(cost)),
    comment,
    data: { custom_position: true, ...data }
  };
}
function pvcItems() {
  const rows = [];
  const diameters = parseDiameters(val('advPvcDiameters'));
  const thick = num(val('advPvcThickness')) || 20;
  const waste = num(val('advPvcWaste')) || 1.35;
  const pvcCost = num(val('advPvcCost')) || 7600;
  const printCost = num(val('advPrintCost')) || 900;
  const cutCost = num(val('advCutCost')) || 180;
  const print = val('advPvcPrint') || 'принт';
  const file = val('advPvcFile') || 'файл у клиента';
  diameters.forEach((part) => {
    const area = circleArea(part.diameter, part.qty);
    const material = round2(area * waste);
    rows.push(make({ category: 'ПВХ / фигуры', type: 'Изготовление', name: `ПВХ ${thick} мм, круг ${part.diameter} см, ${part.qty} шт`, unit: 'м²', qty: material, cost: pvcCost, comment: `Площадь с запасом ${waste}: ${material} м²`, data: { mode: 'pvc_circle_material', diameter_cm: part.diameter, thickness_mm: thick, pieces: part.qty, file } }));
    rows.push(make({ category: 'Печать', type: 'Изготовление', name: `Печать на круге ${part.diameter} см: ${print}`, unit: 'м²', qty: round2(area), cost: printCost, comment: `${print}. ${file}`, data: { mode: 'pvc_circle_print', diameter_cm: part.diameter, pieces: part.qty } }));
    rows.push(make({ category: 'Фигурная резка', type: 'Услуга', name: `Резка круга ${part.diameter} см`, unit: 'шт', qty: part.qty, cost: cutCost, comment: 'Фигурная резка ПВХ', data: { mode: 'pvc_circle_cut', diameter_cm: part.diameter } }));
  });
  return rows;
}
function letterItems() {
  const spec = parsePairs(val('advLettersSpec'));
  const height = num(val('advLettersHeight')) || 10;
  const color = val('advLettersColor') || 'чёрный';
  const material = val('advLettersMaterial') || 'самоклеящаяся плёнка';
  const cost = num(val('advLettersCost')) || 25;
  const client = num(val('advLettersClient')) || 0;
  return spec.map((part) => make({ category: 'Буквы / цифры', type: 'Изготовление', name: `Цифра/буква «${part.name}» ${height} см, ${color}`, unit: 'шт', qty: part.qty, cost, client, comment: material, data: { mode: 'letters', symbol: part.name, height_cm: height, color, material } }));
}
function manualItem() {
  return [make({ category: val('advManualCategory') || 'Ручная позиция', type: val('advManualType') || 'Услуга', name: val('advManualName') || 'Ручная позиция', unit: val('advManualUnit') || 'шт', qty: num(val('advManualQty')) || 1, cost: num(val('advManualCost')), client: num(val('advManualClient')), comment: val('advManualComment'), data: { mode: 'manual', characteristics: val('advManualData') } })];
}
function serviceItem() {
  return [make({ category: 'Услуга', type: 'Услуга', name: val('advServiceName') || 'Услуга', unit: 'шт', qty: 1, cost: num(val('advServiceCost')), client: num(val('advServiceClient')), comment: val('advServiceComment'), data: { mode: 'service' } })];
}
function currentModeItems() {
  const mode = val('advMode') || 'pvc';
  if (mode === 'pvc') return pvcItems();
  if (mode === 'letters') return letterItems();
  if (mode === 'manual') return manualItem();
  return serviceItem();
}
function fields(mode) {
  if (mode === 'pvc') return `<div class="v4-calc-mode-help"><b>ПВХ-фигуры:</b> круги, таблички, нестандартная резка. Диаметры можно писать: 30, 35, 40 или 30x2, 40x3.</div><div class="v4-form-grid"><label>Толщина ПВХ, мм<input id="advPvcThickness" type="number" value="20"></label><label>Диаметры, см<input id="advPvcDiameters" value="30, 35, 40"></label><label>Коэф. запаса<input id="advPvcWaste" type="number" step="0.05" value="1.35"></label><label>Себест. ПВХ, ₽/м²<input id="advPvcCost" type="number" value="7600"></label><label>Себест. печати, ₽/м²<input id="advPrintCost" type="number" value="900"></label><label>Себест. резки, ₽/шт<input id="advCutCost" type="number" value="180"></label><label>Что печатаем<input id="advPvcPrint" value="принт пиццы пепперони"></label><label>Файл / ссылка / примечание<input id="advPvcFile" value="Фото в отличном качестве есть у клиента"></label></div>`;
  if (mode === 'letters') return `<div class="v4-calc-mode-help"><b>Цифры и буквы:</b> пример: 3-2шт, 0-2шт, 5-1шт.</div><div class="v4-form-grid"><label>Спецификация<input id="advLettersSpec" value="3-2шт, 0-2шт, 5-1шт"></label><label>Высота, см<input id="advLettersHeight" type="number" value="10"></label><label>Цвет<input id="advLettersColor" value="чёрный"></label><label>Материал<input id="advLettersMaterial" value="самоклеящаяся плёнка"></label><label>Себест., ₽/шт<input id="advLettersCost" type="number" value="25"></label><label>Клиенту, ₽/шт<input id="advLettersClient" type="number" placeholder="пусто = авто"></label></div>`;
  if (mode === 'manual') return `<div class="v4-calc-mode-help"><b>Ручная позиция:</b> для всего, чего нет в номенклатуре. Сохраняется в расчёт без catalog_id.</div><div class="v4-form-grid"><label>Название<input id="advManualName" placeholder="Например: нестандартный крепёж"></label><label>Категория<input id="advManualCategory" value="Ручная позиция"></label><label>Тип<select id="advManualType"><option>Изготовление</option><option>Услуга</option><option>Материал</option><option>Дизайн</option><option>Монтаж</option></select></label><label>Ед. изм.<input id="advManualUnit" value="шт"></label><label>Кол-во<input id="advManualQty" type="number" step="0.01" value="1"></label><label>Себест. ед.<input id="advManualCost" type="number" value="0"></label><label>Клиенту ед.<input id="advManualClient" type="number" placeholder="пусто = авто"></label><label>Характеристики<textarea id="advManualData" rows="2"></textarea></label><label>Комментарий<input id="advManualComment"></label></div>`;
  return `<div class="v4-calc-mode-help"><b>Услуга:</b> дизайн, монтаж, доставка, замер одной строкой.</div><div class="v4-form-grid"><label>Название<select id="advServiceName"><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Выезд / замер</option><option>Другое</option></select></label><label>Себестоимость<input id="advServiceCost" type="number" value="0"></label><label>Клиенту<input id="advServiceClient" type="number" placeholder="пусто = авто"></label><label>Комментарий<input id="advServiceComment"></label></div>`;
}
function modeButtons(mode) {
  return [['pvc', 'ПВХ-фигуры'], ['letters', 'Буквы / цифры'], ['manual', 'Ручная позиция'], ['service', 'Услуга']]
    .map(([key, label]) => `<button type="button" data-adv-mode="${key}" class="${mode === key ? 'is-active' : ''}">${label}</button>`).join('');
}
function needOptions() {
  const needs = v4State.leadNeeds || [];
  return `<option value="">Общий расчёт</option>${needs.filter((need) => need.status !== 'Архив').map((need) => `<option value="${esc(need.id)}">${esc(need.title || need.need_type || 'Потребность')}</option>`).join('')}`;
}
function renderRows() {
  const body = byId('advCalcRows');
  const totalsBox = byId('advCalcTotals');
  if (!body || !totalsBox) return;
  const total = totals();
  body.innerHTML = items.length ? items.map((item, index) => {
    const row = calcRow(item, index);
    return `<tr><td>${esc(row.name)}${row.comment ? `<small>${esc(row.comment)}</small>` : ''}</td><td>${esc(row.category)}</td><td>${esc(row.unit)}</td><td>${Number(row.qty).toLocaleString('ru-RU')}</td><td>${money(row.contractor_price)}</td><td>${money(row.client_price)}</td><td>${money(row.client_sum)}</td><td><button type="button" data-adv-remove="${index}">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="8">Добавьте нестандартную позицию.</td></tr>';
  totalsBox.className = `v4-calc-totals ${total.profit < 0 ? 'is-error' : total.margin < 20 ? 'is-warn' : 'is-good'}`;
  totalsBox.innerHTML = `<span><b>Клиенту:</b> ${money(total.client)}</span><span><b>Себестоимость:</b> ${money(total.contractor)}</span><span><b>Прибыль:</b> ${money(total.profit)}</span><span><b>Маржа:</b> ${Math.round(total.margin)}%</span>${total.warnings.length ? `<span><b>Проверить:</b> ${esc(total.warnings.join(', '))}</span>` : ''}`;
}
function preview() {
  const box = byId('advCalcPreview');
  if (!box) return;
  const rows = currentModeItems();
  if (!rows.length) {
    box.innerHTML = '<em>Заполните поля — предпросмотр появится здесь.</em>';
    box.className = 'v4-calc-live is-warn';
    return;
  }
  const calcRows = rows.map(calcRow);
  const contractor = calcRows.reduce((sum, row) => sum + row.contractor_sum, 0);
  const client = calcRows.reduce((sum, row) => sum + row.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  box.className = `v4-calc-live ${profit < 0 ? 'is-error' : margin < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `<span><b>Позиций:</b> ${rows.length}</span><span><b>Клиенту:</b> ${money(client)}</span><span><b>Себестоимость:</b> ${money(contractor)}</span><span><b>Маржа:</b> ${Math.round(margin)}%</span><div class="v4-estimate-lines">${calcRows.map((row) => `<div><b>${esc(row.name)}</b><span>${Number(row.qty).toLocaleString('ru-RU')} ${esc(row.unit)} · ${money(row.client_sum)}</span></div>`).join('')}</div>`;
}
function render() {
  const base = byId('calculationsBox');
  if (!base || !v4State.route.leadId) return;
  let host = byId('advancedCalculationsBox');
  if (!host) {
    host = document.createElement('section');
    host.id = 'advancedCalculationsBox';
    host.className = 'v4-subcard v4-advanced-calc-section';
    base.insertAdjacentElement('afterend', host);
  }
  const mode = byId('advMode')?.value || 'pvc';
  host.innerHTML = `<div class="v4-subcard-head"><div><h3>Нестандартный расчёт</h3><p>Для заказов, которых нет в номенклатуре: ПВХ-фигуры, буквы, цифры, ручные позиции и разовые услуги.</p></div><span class="v4-muted">ручные позиции сохраняются в расчёт</span></div><div class="v4-calc-form" data-advanced-calculator="1"><div class="v4-form-grid"><label>Название расчёта<input id="advCalcTitle" placeholder="Например: ПВХ-круги с пиццей и цифры"></label><label>Потребность<select id="advNeedId">${needOptions()}</select></label><label>Комментарий для клиента<input id="advPublicComment" placeholder="Что входит в стоимость"></label></div><div class="v4-calc-auto-box"><h4>Формат нестандартной позиции</h4><div class="v4-mode-buttons">${modeButtons(mode)}</div><input id="advMode" type="hidden" value="${esc(mode)}"><div id="advFields">${fields(mode)}</div><div id="advCalcPreview" class="v4-calc-live"></div><div class="v4-form-actions"><button id="advAddBtn" class="v4-primary" type="button">Добавить позицию</button><button id="advPizzaDemoBtn" type="button">Добавить пример из запроса</button></div></div><div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Позиция</th><th>Категория</th><th>Ед.</th><th>Кол-во</th><th>Себест.</th><th>Клиенту</th><th>Сумма</th><th></th></tr></thead><tbody id="advCalcRows"></tbody></table></div><div id="advCalcTotals" class="v4-calc-totals"></div><div class="v4-form-actions"><button id="advSaveBtn" class="v4-primary" type="button">Сохранить нестандартный расчёт</button><button id="advClearBtn" type="button">Очистить</button></div></div>`;
  renderRows();
  preview();
}
function addCurrent() {
  const rows = currentModeItems();
  if (!rows.length) { toast('Заполните параметры позиции'); return; }
  items.push(...rows);
  if (byId('advCalcTitle') && !byId('advCalcTitle').value.trim()) byId('advCalcTitle').value = rows[0].name;
  renderRows();
  toast(`Добавлено позиций: ${rows.length}`);
}
function addDemo() {
  const old = byId('advMode')?.value || 'pvc';
  if (byId('advMode')) byId('advMode').value = 'pvc';
  render();
  items.push(...currentModeItems());
  if (byId('advMode')) byId('advMode').value = 'letters';
  render();
  items.push(...currentModeItems());
  if (byId('advCalcTitle')) byId('advCalcTitle').value = 'ПВХ-круги с пиццей пепперони и чёрные цифры';
  if (byId('advPublicComment')) byId('advPublicComment').value = 'Включены 3 круга из ПВХ 20 мм с принтом пиццы пепперони и чёрные цифры 10 см: 3 — 2 шт, 0 — 2 шт, 5 — 1 шт.';
  if (byId('advMode')) byId('advMode').value = old;
  render();
  toast('Добавлен пример из запроса');
}
async function save() {
  if (busy || !v4State.route.leadId) return;
  const total = totals();
  if (!items.length || total.client <= 0 || total.profit < 0) { toast('Проверьте расчёт перед сохранением'); return; }
  busy = true;
  let created = null;
  try {
    setStatus('Сохраняю нестандартный расчёт...', 'warn');
    const calc = await timeout(supabaseClient.from('leader_lead_calculations').insert({
      lead_id: v4State.route.leadId,
      need_id: val('advNeedId') || null,
      client_id: v4State.currentLead?.converted_client_id || null,
      title: val('advCalcTitle') || 'Нестандартный расчёт',
      status: 'Черновик',
      version_number: (v4State.calculations || []).length + 1,
      client_total: total.client,
      contractor_cost: total.contractor,
      profit: total.profit,
      margin_percent: total.margin,
      warning_level: total.warnings.length ? 'warning' : 'ok',
      warnings: total.warnings,
      public_comment: val('advPublicComment'),
      internal_comment: 'Нестандартный расчёт с ручными позициями',
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    }).select(CALC_FIELDS).single(), 14000, 'Расчёт не сохранился за 14 секунд');
    if (calc.error) throw calc.error;
    created = calc.data.id;
    const payload = total.rows.map((row, index) => ({ ...row, calculation_id: calc.data.id, lead_id: v4State.route.leadId, sort_order: index + 1 }));
    const saved = await timeout(supabaseClient.from('leader_lead_calculation_items').insert(payload), 14000, 'Позиции не сохранились за 14 секунд');
    if (saved.error) throw saved.error;
    setState({ calculations: [calc.data, ...(v4State.calculations || [])] });
    items = [];
    render();
    setStatus('Нестандартный расчёт сохранён. Можно формировать КП.', 'good');
    toast('Расчёт сохранён');
  } catch (error) {
    if (created) await supabaseClient.from('leader_lead_calculations').delete().eq('id', created);
    setStatus(`Ошибка расчёта: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    busy = false;
  }
}
function bind() {
  document.addEventListener('click', async (event) => {
    if (!event.target.closest('#advancedCalculationsBox')) return;
    const mode = event.target.closest('[data-adv-mode]');
    if (mode) { byId('advMode').value = mode.dataset.advMode; render(); return; }
    if (event.target.closest('#advAddBtn')) addCurrent();
    if (event.target.closest('#advPizzaDemoBtn')) addDemo();
    if (event.target.closest('#advClearBtn')) { items = []; renderRows(); }
    if (event.target.closest('#advSaveBtn')) await save();
    const remove = event.target.closest('[data-adv-remove]');
    if (remove) { items.splice(Number(remove.dataset.advRemove), 1); renderRows(); }
  });
  document.addEventListener('input', (event) => { if (event.target.closest('#advancedCalculationsBox')) preview(); });
  document.addEventListener('change', (event) => { if (event.target.closest('#advancedCalculationsBox')) preview(); });
  document.addEventListener('leader-v4:lead-card-rendered', render);
  document.addEventListener('leader-v4:route-change', () => { items = []; setTimeout(render, 60); });
  document.addEventListener('leader-v4:crm-ready', render);
}

bind();
setTimeout(render, 100);
