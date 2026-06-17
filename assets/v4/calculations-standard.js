import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let rows = [];
let saving = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function num(value) {
  const n = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function val(id) { return byId(id)?.value?.trim() || ''; }
function checked(id) { return Boolean(byId(id)?.checked); }
function money(value) { return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`; }
function autoClient(cost) {
  const c = Number(cost || 0);
  if (c <= 0) return 0;
  const k = c < 3000 ? 1.9 : c < 15000 ? 1.55 : 1.35;
  return Math.ceil(c * k / 10) * 10;
}
function area(width, height, qty = 1) { return num(width) * num(height) * (num(qty) || 1); }
function perimeter(width, height, qty = 1) { return 2 * (num(width) + num(height)) * (num(qty) || 1); }

function item({ category, type = 'Изготовление', name, unit = 'шт', qty = 1, contractor = 0, client = 0, comment = '', data = {} }) {
  const q = Number(qty || 0);
  const cp = Number(contractor || 0);
  const pp = Number(client || autoClient(cp));
  return {
    catalog_id: null,
    category: category || 'Типовая позиция',
    item_type: type,
    name: name || 'Позиция',
    unit,
    qty: q,
    contractor_price: cp,
    client_price: pp,
    comment,
    data: { custom_position: true, quick_standard: true, ...data }
  };
}
function calcItem(raw, index = 0) {
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
  const items = rows.map(calcItem);
  const contractor = items.reduce((s, x) => s + x.contractor_sum, 0);
  const client = items.reduce((s, x) => s + x.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!items.length) warnings.push('нет позиций');
  if (client <= 0) warnings.push('сумма клиенту 0');
  if (profit < 0) warnings.push('убыток');
  if (client > 0 && margin < 20) warnings.push('маржа ниже 20%');
  return { items, contractor, client, profit, margin, warnings };
}

function modeFields(mode) {
  if (mode === 'banner') {
    return `
      <div class="v4-calc-mode-help"><b>Баннер:</b> площадь считается по ширине и высоте. Отдельно можно добавить проклейку и люверсы.</div>
      <div class="v4-form-grid">
        <label>Материал<select id="stdBannerMaterial"><option value="350">Баннер 340/440 стандарт — себ. 350 ₽/м²</option><option value="450">Баннер 440 усиленная печать — себ. 450 ₽/м²</option><option value="520">Баннер 510 плотный — себ. 520 ₽/м²</option></select></label>
        <label>Ширина, м<input id="stdWidth" type="number" step="0.01" min="0" placeholder="3"></label>
        <label>Высота, м<input id="stdHeight" type="number" step="0.01" min="0" placeholder="2"></label>
        <label>Количество<input id="stdQty" type="number" step="1" min="1" value="1"></label>
        <label>Проклейка, ₽/м<input id="stdHemmingCost" type="number" value="30"></label>
        <label>Люверс, ₽/шт<input id="stdGrommetCost" type="number" value="15"></label>
        <label>Шаг люверсов, м<input id="stdGrommetStep" type="number" step="0.05" value="0.3"></label>
      </div>
      <div class="v4-option-row"><label><input id="stdHemming" type="checkbox" checked> Проклейка</label><label><input id="stdGrommets" type="checkbox" checked> Люверсы</label></div>`;
  }
  if (mode === 'film') {
    return `
      <div class="v4-calc-mode-help"><b>Плёнка:</b> самоклейка, витрины, наклейки, плоттер. Можно добавить монтажную плёнку и резку.</div>
      <div class="v4-form-grid">
        <label>Материал<select id="stdFilmMaterial"><option value="550">Самоклеящаяся плёнка печать — себ. 550 ₽/м²</option><option value="750">Перфорированная плёнка OWV — себ. 750 ₽/м²</option><option value="700">Плёнка плоттерная цветная — себ. 700 ₽/м²</option></select></label>
        <label>Ширина, м<input id="stdWidth" type="number" step="0.01" min="0"></label>
        <label>Высота, м<input id="stdHeight" type="number" step="0.01" min="0"></label>
        <label>Количество<input id="stdQty" type="number" step="1" min="1" value="1"></label>
        <label>Монтажная плёнка, ₽/м²<input id="stdMountFilmCost" type="number" value="300"></label>
        <label>Плоттер/резка, ₽/м²<input id="stdCutFilmCost" type="number" value="250"></label>
      </div>
      <div class="v4-option-row"><label><input id="stdMountFilm" type="checkbox"> Монтажная плёнка</label><label><input id="stdCutFilm" type="checkbox"> Плоттерная резка / выборка</label></div>`;
  }
  if (mode === 'sheet') {
    return `
      <div class="v4-calc-mode-help"><b>Листовой материал:</b> ПВХ, композит, металл, таблички и основы. Можно добавить печать/накатку и резку.</div>
      <div class="v4-form-grid">
        <label>Материал<select id="stdSheetMaterial"><option value="1400">ПВХ 3 мм — себ. 1400 ₽/м²</option><option value="2150">ПВХ 5 мм — себ. 2150 ₽/м²</option><option value="4400">ПВХ 10 мм — себ. 4400 ₽/м²</option><option value="7600">ПВХ 20 мм — себ. 7600 ₽/м²</option><option value="1500">Листовой металл/железо — себ. 1500 ₽/м²</option></select></label>
        <label>Ширина, м<input id="stdWidth" type="number" step="0.01" min="0"></label>
        <label>Высота, м<input id="stdHeight" type="number" step="0.01" min="0"></label>
        <label>Количество<input id="stdQty" type="number" step="1" min="1" value="1"></label>
        <label>Печать/накатка, ₽/м²<input id="stdSheetPrintCost" type="number" value="650"></label>
        <label>Резка, ₽/шт<input id="stdSheetCutCost" type="number" value="180"></label>
      </div>
      <div class="v4-option-row"><label><input id="stdSheetPrint" type="checkbox"> Добавить печать / накатку</label><label><input id="stdSheetCut" type="checkbox"> Добавить резку</label></div>`;
  }
  return `
    <div class="v4-calc-mode-help"><b>Отдельная услуга:</b> дизайн, монтаж, доставка, выезд, замер. Удобно добавлять в расчёт отдельной строкой.</div>
    <div class="v4-form-grid">
      <label>Услуга<select id="stdServiceName"><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Выезд / замер</option><option>Срочность</option><option>Другое</option></select></label>
      <label>Себестоимость<input id="stdServiceCost" type="number" value="0"></label>
      <label>Цена клиенту<input id="stdServiceClient" type="number" placeholder="пусто = авто"></label>
      <label>Комментарий<input id="stdServiceComment" placeholder="Что входит"></label>
    </div>`;
}

function modeButtons(mode) {
  return [['banner','Баннеры'],['film','Плёнка'],['sheet','Листовые материалы'],['service','Отдельная услуга']]
    .map(([key, label]) => `<button type="button" data-std-mode="${key}" class="${mode === key ? 'is-active' : ''}">${label}</button>`).join('');
}
function needOptions() {
  const needs = v4State.leadNeeds || [];
  return `<option value="">Общий расчёт</option>${needs.filter((n) => n.status !== 'Архив').map((n) => `<option value="${esc(n.id)}">${esc(n.title || n.need_type || 'Потребность')}</option>`).join('')}`;
}
function currentItems() {
  const mode = val('stdMode') || 'banner';
  const width = num(val('stdWidth'));
  const height = num(val('stdHeight'));
  const qty = num(val('stdQty')) || 1;
  const a = area(width, height, qty);
  const p = perimeter(width, height, qty);
  const result = [];

  if (mode === 'banner') {
    if (a <= 0) return [];
    const cost = num(val('stdBannerMaterial')) || 350;
    result.push(item({ category: 'Баннеры', name: `Баннер ${width}×${height} м · ${qty} шт`, unit: 'м²', qty: a, contractor: cost, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode, width, height, pieces: qty } }));
    if (checked('stdHemming') && p > 0) result.push(item({ category: 'Постпечатная обработка', type: 'Услуга', name: 'Проклейка баннера по периметру', unit: 'м', qty: p, contractor: num(val('stdHemmingCost')) || 30, comment: `Периметр ${p.toFixed(2)} м`, data: { mode: 'banner_hemming' } }));
    if (checked('stdGrommets') && p > 0) {
      const step = num(val('stdGrommetStep')) || 0.3;
      const count = Math.ceil(p / step);
      result.push(item({ category: 'Фурнитура', type: 'Услуга', name: `Люверсы, шаг ${step} м`, unit: 'шт', qty: count, contractor: num(val('stdGrommetCost')) || 15, comment: `Количество ${count} шт`, data: { mode: 'banner_grommets', step } }));
    }
  }
  if (mode === 'film') {
    if (a <= 0) return [];
    const cost = num(val('stdFilmMaterial')) || 550;
    result.push(item({ category: 'Плёнка', name: `Плёнка ${width}×${height} м · ${qty} шт`, unit: 'м²', qty: a, contractor: cost, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode, width, height, pieces: qty } }));
    if (checked('stdMountFilm')) result.push(item({ category: 'Плёнка', type: 'Материал', name: 'Монтажная плёнка', unit: 'м²', qty: a, contractor: num(val('stdMountFilmCost')) || 300, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode: 'mount_film' } }));
    if (checked('stdCutFilm')) result.push(item({ category: 'Плоттерная резка', type: 'Услуга', name: 'Плоттерная резка / выборка', unit: 'м²', qty: a, contractor: num(val('stdCutFilmCost')) || 250, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode: 'film_cutting' } }));
  }
  if (mode === 'sheet') {
    if (a <= 0) return [];
    const cost = num(val('stdSheetMaterial')) || 1400;
    result.push(item({ category: 'Листовые материалы', name: `Листовой материал ${width}×${height} м · ${qty} шт`, unit: 'м²', qty: a, contractor: cost, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode, width, height, pieces: qty } }));
    if (checked('stdSheetPrint')) result.push(item({ category: 'Печать', name: 'Печать / накатка на листовой материал', unit: 'м²', qty: a, contractor: num(val('stdSheetPrintCost')) || 650, comment: `Площадь ${a.toFixed(2)} м²`, data: { mode: 'sheet_print' } }));
    if (checked('stdSheetCut')) result.push(item({ category: 'Резка', type: 'Услуга', name: 'Резка листового материала', unit: 'шт', qty, contractor: num(val('stdSheetCutCost')) || 180, comment: `${qty} шт`, data: { mode: 'sheet_cut' } }));
  }
  if (mode === 'service') {
    result.push(item({ category: 'Услуга', type: 'Услуга', name: val('stdServiceName') || 'Услуга', unit: 'шт', qty: 1, contractor: num(val('stdServiceCost')), client: num(val('stdServiceClient')), comment: val('stdServiceComment'), data: { mode } }));
  }
  return result;
}

function renderPreview() {
  const box = byId('stdCalcPreview');
  if (!box) return;
  const preview = currentItems().map(calcItem);
  if (!preview.length) { box.className = 'v4-calc-live is-warn'; box.innerHTML = '<em>Заполните параметры — позиции появятся здесь.</em>'; return; }
  const client = preview.reduce((s, r) => s + r.client_sum, 0);
  const contractor = preview.reduce((s, r) => s + r.contractor_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? profit / client * 100 : 0;
  box.className = `v4-calc-live ${profit < 0 ? 'is-error' : margin < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `<span><b>Позиций:</b> ${preview.length}</span><span><b>Клиенту:</b> ${money(client)}</span><span><b>Себестоимость:</b> ${money(contractor)}</span><span><b>Маржа:</b> ${Math.round(margin)}%</span><div class="v4-estimate-lines">${preview.map((r) => `<div><b>${esc(r.name)}</b><span>${Number(r.qty).toLocaleString('ru-RU')} ${esc(r.unit)} · ${money(r.client_sum)}</span></div>`).join('')}</div>`;
}
function renderRows() {
  const body = byId('stdCalcRows');
  const totalBox = byId('stdCalcTotals');
  if (!body || !totalBox) return;
  const t = totals();
  body.innerHTML = rows.length ? rows.map((r, index) => {
    const row = calcItem(r, index);
    return `<tr><td>${esc(row.name)}${row.comment ? `<small>${esc(row.comment)}</small>` : ''}</td><td>${esc(row.category)}</td><td>${esc(row.unit)}</td><td>${Number(row.qty).toLocaleString('ru-RU')}</td><td>${money(row.contractor_price)}</td><td>${money(row.client_price)}</td><td>${money(row.client_sum)}</td><td><button type="button" data-std-remove="${index}">×</button></td></tr>`;
  }).join('') : '<tr><td colspan="8">Добавьте позицию.</td></tr>';
  totalBox.className = `v4-calc-totals ${t.profit < 0 ? 'is-error' : t.margin < 20 ? 'is-warn' : 'is-good'}`;
  totalBox.innerHTML = `<span><b>Клиенту:</b> ${money(t.client)}</span><span><b>Себестоимость:</b> ${money(t.contractor)}</span><span><b>Прибыль:</b> ${money(t.profit)}</span><span><b>Маржа:</b> ${Math.round(t.margin)}%</span>${t.warnings.length ? `<span><b>Проверить:</b> ${esc(t.warnings.join(', '))}</span>` : ''}`;
}
function render() {
  const base = byId('calculationsBox');
  if (!base || !v4State.route.leadId) return;
  let host = byId('standardCalculationsBox');
  if (!host) {
    host = document.createElement('section');
    host.id = 'standardCalculationsBox';
    host.className = 'v4-subcard v4-standard-calc-section';
    base.insertAdjacentElement('afterend', host);
  }
  const mode = val('stdMode') || 'banner';
  host.innerHTML = `
    <div class="v4-subcard-head"><div><h3>Быстрый расчёт типовых позиций</h3><p>Баннеры, плёнка, листовые материалы и отдельные услуги. Эти позиции можно добавлять вместе с нестандартными.</p></div><span class="v4-muted">типовые работы</span></div>
    <div class="v4-calc-form" data-standard-calculator="1">
      <div class="v4-form-grid"><label>Название расчёта<input id="stdCalcTitle" placeholder="Например: баннер с люверсами"></label><label>Потребность<select id="stdNeedId">${needOptions()}</select></label><label>Комментарий для клиента<input id="stdPublicComment" placeholder="Что входит в стоимость"></label></div>
      <div class="v4-calc-auto-box"><h4>Формат позиции</h4><div class="v4-mode-buttons">${modeButtons(mode)}</div><input id="stdMode" type="hidden" value="${esc(mode)}"><div id="stdFields">${modeFields(mode)}</div><div id="stdCalcPreview" class="v4-calc-live"></div><div class="v4-form-actions"><button id="stdAddBtn" class="v4-primary" type="button">Добавить позицию</button></div></div>
      <div class="v4-table-wrap"><table class="v4-table"><thead><tr><th>Позиция</th><th>Категория</th><th>Ед.</th><th>Кол-во</th><th>Себест.</th><th>Клиенту</th><th>Сумма</th><th></th></tr></thead><tbody id="stdCalcRows"></tbody></table></div>
      <div id="stdCalcTotals" class="v4-calc-totals"></div>
      <div class="v4-form-actions"><button id="stdSaveBtn" class="v4-primary" type="button">Сохранить типовой расчёт</button><button id="stdClearBtn" type="button">Очистить</button></div>
    </div>`;
  renderRows();
  renderPreview();
}
function addCurrent() {
  const current = currentItems();
  if (!current.length) { toast('Заполните параметры позиции'); return; }
  rows.push(...current);
  if (byId('stdCalcTitle') && !byId('stdCalcTitle').value.trim()) byId('stdCalcTitle').value = current[0].name;
  renderRows();
  toast(`Добавлено позиций: ${current.length}`);
}
async function save() {
  if (saving || !v4State.route.leadId) return;
  const t = totals();
  if (!rows.length || t.client <= 0 || t.profit < 0) { toast('Проверьте расчёт перед сохранением'); return; }
  saving = true;
  let created = null;
  try {
    setStatus('Сохраняю типовой расчёт...', 'warn');
    const calc = await timeout(supabaseClient.from('leader_lead_calculations').insert({
      lead_id: v4State.route.leadId,
      need_id: val('stdNeedId') || null,
      client_id: v4State.currentLead?.converted_client_id || null,
      title: val('stdCalcTitle') || 'Типовой расчёт',
      status: 'Черновик',
      version_number: (v4State.calculations || []).length + 1,
      client_total: t.client,
      contractor_cost: t.contractor,
      profit: t.profit,
      margin_percent: t.margin,
      warning_level: t.warnings.length ? 'warning' : 'ok',
      warnings: t.warnings,
      public_comment: val('stdPublicComment'),
      internal_comment: 'Быстрый типовой расчёт',
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    }).select(CALC_FIELDS).single(), 14000, 'Расчёт не сохранился за 14 секунд');
    if (calc.error) throw calc.error;
    created = calc.data.id;
    const payload = t.items.map((r, i) => ({ ...r, calculation_id: calc.data.id, lead_id: v4State.route.leadId, sort_order: i + 1 }));
    const saved = await timeout(supabaseClient.from('leader_lead_calculation_items').insert(payload).select(ITEM_FIELDS), 14000, 'Позиции не сохранились за 14 секунд');
    if (saved.error) throw saved.error;
    setState({ calculations: [calc.data, ...(v4State.calculations || [])] });
    rows = [];
    render();
    setStatus('Типовой расчёт сохранён. Можно формировать КП.', 'good');
    toast('Расчёт сохранён');
  } catch (error) {
    if (created) await supabaseClient.from('leader_lead_calculations').delete().eq('id', created);
    setStatus(`Ошибка расчёта: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally { saving = false; }
}
function bind() {
  document.addEventListener('click', async (event) => {
    if (!event.target.closest('#standardCalculationsBox')) return;
    const mode = event.target.closest('[data-std-mode]');
    if (mode) { byId('stdMode').value = mode.dataset.stdMode; render(); return; }
    if (event.target.closest('#stdAddBtn')) addCurrent();
    if (event.target.closest('#stdClearBtn')) { rows = []; renderRows(); }
    if (event.target.closest('#stdSaveBtn')) await save();
    const remove = event.target.closest('[data-std-remove]');
    if (remove) { rows.splice(Number(remove.dataset.stdRemove), 1); renderRows(); }
  });
  document.addEventListener('input', (event) => { if (event.target.closest('#standardCalculationsBox')) renderPreview(); });
  document.addEventListener('change', (event) => { if (event.target.closest('#standardCalculationsBox')) renderPreview(); });
  document.addEventListener('leader-v4:lead-card-rendered', render);
  document.addEventListener('leader-v4:route-change', () => { rows = []; setTimeout(render, 60); });
  document.addEventListener('leader-v4:crm-ready', render);
}

bind();
setTimeout(render, 100);
