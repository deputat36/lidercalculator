import { byId, toast } from './ui.js';

let observer = null;
let tableObserver = null;

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function num(id) {
  return Number(String(byId(id)?.value || '').replace(',', '.')) || 0;
}

function text(id) {
  return byId(id)?.value?.trim() || '';
}

function setValue(id, value) {
  const input = byId(id);
  if (input) input.value = value;
}

function calcCurrentItem() {
  const qty = num('calcItemQty') || 1;
  const cost = num('calcItemCost');
  const client = num('calcItemClient');
  const contractorSum = qty * cost;
  const clientSum = qty * client;
  const profit = clientSum - contractorSum;
  const margin = clientSum > 0 ? (profit / clientSum) * 100 : 0;
  return { qty, cost, client, contractorSum, clientSum, profit, margin };
}

function insertOnce(target, position, html, marker) {
  if (!target || document.querySelector(marker)) return;
  target.insertAdjacentHTML(position, html);
}

function labelFor(id) {
  return byId(id)?.closest('label');
}

function addHint(id, text) {
  const label = labelFor(id);
  if (!label || label.querySelector('.v4-calc-field-hint')) return;
  label.insertAdjacentHTML('beforeend', `<span class="v4-calc-field-hint">${text}</span>`);
}

function updatePreview() {
  const preview = byId('calcItemPreview');
  if (!preview) return;

  const item = calcCurrentItem();
  const level = item.clientSum <= 0 ? 'is-info' : item.profit < 0 ? 'is-error' : item.margin < 20 ? 'is-warn' : 'is-good';
  const message = item.clientSum <= 0
    ? 'Укажите цену клиенту, и система покажет прибыль и маржу.'
    : item.profit < 0
      ? 'Цена клиенту ниже себестоимости. Такая позиция убыточна.'
      : item.margin < 20
        ? 'Маржа ниже 20%. Проверьте, достаточно ли заложена прибыль.'
        : 'Позиция выглядит нормально. Можно добавить в расчёт.';

  preview.className = `v4-calc-preview ${level}`;
  preview.innerHTML = `
    <div><small>Клиенту</small><b>${money(item.clientSum)}</b></div>
    <div><small>Себестоимость</small><b>${money(item.contractorSum)}</b></div>
    <div><small>Прибыль</small><b>${money(item.profit)}</b></div>
    <div><small>Маржа</small><b>${Math.round(item.margin)}%</b></div>
    <p>${message}</p>
  `;
}

function applyMarkup(multiplier) {
  const cost = num('calcItemCost');
  if (cost <= 0) {
    toast('Сначала укажите себестоимость за единицу');
    byId('calcItemCost')?.focus();
    return;
  }
  setValue('calcItemClient', Math.ceil(cost * multiplier));
  updatePreview();
}

function beforeAddPosition(event) {
  if (!event.target.closest('#addCalcItemBtn')) return;

  const name = text('calcItemName');
  const qty = num('calcItemQty');
  const client = num('calcItemClient');

  if (!name) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast('Укажите, что именно считаем');
    byId('calcItemName')?.focus();
    return;
  }

  if (qty <= 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast('Количество должно быть больше 0');
    byId('calcItemQty')?.focus();
    return;
  }

  if (client <= 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toast('Укажите цену клиенту');
    byId('calcItemClient')?.focus();
    return;
  }

  if (!text('calcTitle')) setValue('calcTitle', name);
  if (!text('calcPublicComment')) {
    setValue('calcPublicComment', 'В стоимость входят работы и материалы по выбранным позициям.');
  }
}

function tableText(row, index) {
  return row.children[index]?.textContent?.trim() || '—';
}

function renderMobileCards() {
  const tableBody = byId('calcDraftItems');
  const holder = byId('calcDraftCards');
  if (!tableBody || !holder) return;

  const rows = [...tableBody.querySelectorAll('tr')];
  if (!rows.length || rows[0].children.length < 6) {
    holder.innerHTML = '<div class="v4-empty">Позиции пока не добавлены.</div>';
    return;
  }

  holder.innerHTML = rows.map((row, index) => `
    <article class="v4-calc-mobile-row">
      <div class="v4-calc-mobile-row-head">
        <b>${tableText(row, 0)}</b>
        <button type="button" data-action="remove-calc-item" data-index="${index}" aria-label="Удалить позицию">×</button>
      </div>
      <div class="v4-calc-mobile-grid">
        <span><small>Ед.</small><b>${tableText(row, 1)}</b></span>
        <span><small>Кол-во</small><b>${tableText(row, 2)}</b></span>
        <span><small>Себест.</small><b>${tableText(row, 3)}</b></span>
        <span><small>Клиенту</small><b>${tableText(row, 4)}</b></span>
        <span><small>Сумма</small><b>${tableText(row, 5)}</b></span>
      </div>
    </article>
  `).join('');
}

function decorateSaveArea() {
  const totals = byId('calcDraftTotals');
  if (!totals || byId('calcUxSaveHint')) return;
  totals.insertAdjacentHTML('afterend', `
    <div id="calcUxSaveHint" class="v4-calc-save-hint">
      Проверьте итоговую сумму, себестоимость, прибыль и маржу. После сохранения из расчёта можно сформировать КП.
    </div>
  `);
}

function observeTable() {
  const tableBody = byId('calcDraftItems');
  if (!tableBody || tableBody.dataset.uxObserved === '1') return;
  tableBody.dataset.uxObserved = '1';
  tableObserver?.disconnect();
  tableObserver = new MutationObserver(() => {
    renderMobileCards();
    decorateSaveArea();
  });
  tableObserver.observe(tableBody, { childList: true, subtree: true });
  renderMobileCards();
  decorateSaveArea();
}

function enhanceCalculationForm() {
  const form = document.querySelector('.v4-calc-form');
  if (!form || form.dataset.uxEnhanced === '1') {
    updatePreview();
    renderMobileCards();
    decorateSaveArea();
    return;
  }

  form.dataset.uxEnhanced = '1';
  form.classList.add('is-ux-enhanced');

  insertOnce(form, 'afterbegin', `
    <div class="v4-calc-guide" data-calc-ux-guide>
      <div class="v4-calc-guide-step is-active"><b>1</b><span>Основа</span></div>
      <div class="v4-calc-guide-step is-active"><b>2</b><span>Позиции</span></div>
      <div class="v4-calc-guide-step is-active"><b>3</b><span>Проверка</span></div>
      <div class="v4-calc-guide-step"><b>4</b><span>Сохранить</span></div>
    </div>
  `, '[data-calc-ux-guide]');

  addHint('calcTitle', 'Можно оставить пустым — название подставится по первой позиции.');
  addHint('calcNeedId', 'Выберите конкретную задачу клиента или оставьте общий расчёт.');
  addHint('calcPublicComment', 'Этот текст можно использовать потом в коммерческом предложении.');
  addHint('calcItemCost', 'Ваши реальные затраты за единицу: материалы, подрядчик, работа.');
  addHint('calcItemClient', 'Цена, которую увидит клиент. Разница с себестоимостью — прибыль.');

  const clientLabel = labelFor('calcItemClient');
  insertOnce(clientLabel, 'afterend', `
    <div class="v4-calc-price-tools" data-calc-ux-tools>
      <span>Быстро посчитать от себестоимости:</span>
      <button type="button" data-calc-markup="1.3">+30%</button>
      <button type="button" data-calc-markup="1.5">+50%</button>
      <button type="button" data-calc-markup="2">×2</button>
    </div>
  `, '[data-calc-ux-tools]');

  const actions = byId('addCalcItemBtn')?.closest('.v4-form-actions');
  insertOnce(actions, 'beforebegin', '<div id="calcItemPreview" class="v4-calc-preview"></div>', '#calcItemPreview');

  const tableWrap = form.querySelector('.v4-table-wrap');
  insertOnce(tableWrap, 'afterend', '<div id="calcDraftCards" class="v4-calc-draft-cards"></div>', '#calcDraftCards');

  updatePreview();
  observeTable();
}

function bindUxEvents() {
  const root = byId('leadCardSection');
  if (!root || root.dataset.calcUxBound === '1') return;
  root.dataset.calcUxBound = '1';

  root.addEventListener('click', beforeAddPosition, true);
  root.addEventListener('click', (event) => {
    const tool = event.target.closest('[data-calc-markup]');
    if (tool) applyMarkup(Number(tool.dataset.calcMarkup || 1));
  });
  root.addEventListener('input', (event) => {
    if (event.target.closest('#calcItemName,#calcItemQty,#calcItemCost,#calcItemClient,#calcItemComment,#calcItemUnit')) updatePreview();
  });
  root.addEventListener('change', (event) => {
    if (event.target.closest('#calcItemUnit')) updatePreview();
  });
}

export function bootCalculationUx() {
  bindUxEvents();
  enhanceCalculationForm();

  document.addEventListener('leader-v4:lead-card-rendered', enhanceCalculationForm);
  document.addEventListener('leader-v4:needs-loaded', enhanceCalculationForm);

  const root = byId('leadCardSection');
  if (!root || observer) return;
  observer = new MutationObserver(() => enhanceCalculationForm());
  observer.observe(root, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', bootCalculationUx);
