import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let editor = null;
let loading = false;
let saving = false;
let decorateTimer = null;

function ensureRevisionStyles() {
  if (document.querySelector('link[data-calculation-revision-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.dataset.calculationRevisionStyle = '1';
  link.href = new URL('./calculations-revision-v1.css?v=20260716-1', import.meta.url).href;
  document.head.appendChild(link);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function num(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function blankRow() {
  return {
    catalog_id: null,
    category: 'Ручная позиция',
    item_type: 'Изготовление',
    name: '',
    unit: 'шт',
    qty: 1,
    contractor_price: 0,
    client_price: 0,
    comment: '',
    data: { calculation_editor: 'revision-v1' }
  };
}

function normalizeRow(row = {}) {
  return {
    catalog_id: row.catalog_id || null,
    category: row.category || 'Ручная позиция',
    item_type: row.item_type || 'Изготовление',
    name: row.name || '',
    unit: row.unit || 'шт',
    qty: num(row.qty) || 1,
    contractor_price: num(row.contractor_price),
    client_price: num(row.client_price),
    comment: row.comment || '',
    data: row.data && typeof row.data === 'object' ? row.data : {}
  };
}

function calculateRow(row, index = 0) {
  const qty = Math.max(0, num(row.qty));
  const contractorPrice = Math.max(0, num(row.contractor_price));
  const clientPrice = Math.max(0, num(row.client_price));
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  return {
    ...row,
    qty,
    contractor_price: contractorPrice,
    client_price: clientPrice,
    contractor_sum: contractorSum,
    client_sum: clientSum,
    profit,
    markup_percent: contractorSum > 0 ? (profit / contractorSum) * 100 : 0,
    margin_percent: clientSum > 0 ? (profit / clientSum) * 100 : 0,
    sort_order: index + 1
  };
}

function totals(rows = editor?.rows || []) {
  const calculated = rows.map(calculateRow);
  const contractor = calculated.reduce((sum, row) => sum + row.contractor_sum, 0);
  const client = calculated.reduce((sum, row) => sum + row.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!calculated.length) warnings.push('Нет позиций');
  if (client <= 0) warnings.push('Сумма клиенту равна 0');
  if (profit < 0) warnings.push('Расчёт убыточный');
  if (client > 0 && margin < 20) warnings.push('Маржа ниже 20%');
  return { calculated, contractor, client, profit, margin, warnings };
}

function calcById(id) {
  return (v4State.calculations || []).find((calc) => calc.id === id) || null;
}

function needOptions(selected = '') {
  const options = [`<option value="" ${selected ? '' : 'selected'}>Общий расчёт по заявке</option>`];
  (v4State.leadNeeds || []).filter((need) => need.status !== 'Архив').forEach((need) => {
    options.push(`<option value="${esc(need.id)}" ${need.id === selected ? 'selected' : ''}>${esc(need.title || need.need_type || 'Потребность')}</option>`);
  });
  return options.join('');
}

function editorHost() {
  const calculationsBox = byId('calculationsBox');
  if (!calculationsBox) return null;
  let host = byId('calculationRevisionBox');
  if (!host) {
    host = document.createElement('section');
    host.id = 'calculationRevisionBox';
    host.className = 'v4-subcard v4-calculation-revision-section';
    calculationsBox.insertAdjacentElement('afterend', host);
  }
  return host;
}

function rowHtml(row, index) {
  const calculated = calculateRow(row, index);
  return `
    <tr data-revision-row="${index}">
      <td><input data-revision-field="name" data-index="${index}" value="${esc(row.name)}" placeholder="Название позиции"></td>
      <td><input data-revision-field="category" data-index="${index}" value="${esc(row.category)}" placeholder="Категория"></td>
      <td>
        <select data-revision-field="item_type" data-index="${index}">
          ${['Изготовление', 'Услуга', 'Материал', 'Дизайн', 'Монтаж', 'Доставка'].map((value) => `<option ${row.item_type === value ? 'selected' : ''}>${value}</option>`).join('')}
        </select>
      </td>
      <td><input data-revision-field="unit" data-index="${index}" value="${esc(row.unit)}" placeholder="шт"></td>
      <td><input data-revision-field="qty" data-index="${index}" type="number" min="0.01" step="0.01" value="${esc(row.qty)}"></td>
      <td><input data-revision-field="contractor_price" data-index="${index}" type="number" min="0" step="0.01" value="${esc(row.contractor_price)}"></td>
      <td><input data-revision-field="client_price" data-index="${index}" type="number" min="0" step="0.01" value="${esc(row.client_price)}"></td>
      <td class="v4-revision-row-sum">${money(calculated.client_sum)}</td>
      <td><input data-revision-field="comment" data-index="${index}" value="${esc(row.comment)}" placeholder="Комментарий"></td>
      <td><button type="button" data-revision-remove="${index}" aria-label="Удалить позицию">×</button></td>
    </tr>`;
}

function renderTotals() {
  const box = byId('revisionTotals');
  if (!box || !editor) return;
  const result = totals();
  box.className = `v4-calc-totals v4-revision-totals ${result.profit < 0 ? 'is-error' : result.margin < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `
    <span><b>Клиенту:</b> ${money(result.client)}</span>
    <span><b>Себестоимость:</b> ${money(result.contractor)}</span>
    <span><b>Прибыль:</b> ${money(result.profit)}</span>
    <span><b>Маржа:</b> ${Math.round(result.margin)}%</span>
    ${result.warnings.length ? `<span><b>Проверить:</b> ${esc(result.warnings.join(', '))}</span>` : ''}`;

  document.querySelectorAll('[data-revision-row]').forEach((tr) => {
    const index = Number(tr.dataset.revisionRow);
    const sum = tr.querySelector('.v4-revision-row-sum');
    if (sum && editor.rows[index]) sum.textContent = money(calculateRow(editor.rows[index], index).client_sum);
  });
}

function renderEditor() {
  const host = editorHost();
  if (!host) return;
  if (!editor) {
    host.classList.add('hidden');
    host.innerHTML = '';
    return;
  }

  host.classList.remove('hidden');
  const source = editor.source;
  const sourceNote = source
    ? `Правки сохранятся как новая версия. Исходный расчёт «${esc(source.title || 'Расчёт')}» останется без изменений${source.commercial_offer_id ? ', потому что по нему уже есть КП' : ''}${source.order_id ? ', и он связан с заказом' : ''}.`
    : 'Создайте новый расчёт прямо в этой заявке. После сохранения он появится в списке и будет доступен для нового КП.';

  host.innerHTML = `
    <div class="v4-subcard-head">
      <div>
        <h3>${source ? 'Внести правки в расчёт' : 'Новый расчёт'}</h3>
        <p>${sourceNote}</p>
      </div>
      <button type="button" data-revision-cancel>Закрыть</button>
    </div>
    ${editor.error ? `<div class="v4-empty is-error">${esc(editor.error)}</div>` : ''}
    <div class="v4-form-grid v4-revision-main-fields">
      <label>Название расчёта
        <input id="revisionTitle" value="${esc(editor.title)}" placeholder="Например: Баннер после правок клиента">
      </label>
      <label>Потребность
        <select id="revisionNeedId">${needOptions(editor.needId)}</select>
      </label>
      <label>Комментарий для клиента
        <input id="revisionPublicComment" value="${esc(editor.publicComment)}" placeholder="Что входит в стоимость">
      </label>
    </div>
    <div class="v4-revision-toolbar">
      <b>Быстро изменить цену клиенту:</b>
      <button type="button" data-revision-markup="30">Себестоимость +30%</button>
      <button type="button" data-revision-markup="50">Себестоимость +50%</button>
      <button type="button" data-revision-markup="100">Себестоимость ×2</button>
      <button type="button" data-revision-add-row>Добавить строку</button>
    </div>
    <div class="v4-table-wrap">
      <table class="v4-table v4-revision-table">
        <thead><tr><th>Позиция</th><th>Категория</th><th>Тип</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма</th><th>Комментарий</th><th></th></tr></thead>
        <tbody id="revisionRows">${editor.rows.length ? editor.rows.map(rowHtml).join('') : '<tr><td colspan="10">Добавьте хотя бы одну позицию.</td></tr>'}</tbody>
      </table>
    </div>
    <div id="revisionTotals" class="v4-calc-totals"></div>
    <div class="v4-form-actions">
      <button type="button" class="v4-primary" data-revision-save ${saving ? 'disabled' : ''}>${saving ? 'Сохраняю…' : 'Сохранить новой версией'}</button>
      <button type="button" data-revision-cancel>Отмена</button>
    </div>`;
  renderTotals();
}

function scheduleDecorate() {
  clearTimeout(decorateTimer);
  decorateTimer = setTimeout(decorateSavedCalculations, 40);
}

function decorateSavedCalculations() {
  const section = document.querySelector('.v4-saved-calc-section');
  if (!section) return;

  const headerActions = section.querySelector('.v4-subcard-head .v4-form-actions');
  if (headerActions && !headerActions.querySelector('[data-revision-new]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v4-primary';
    button.dataset.revisionNew = '1';
    button.textContent = 'Новый расчёт';
    headerActions.prepend(button);
  }

  section.querySelectorAll('.v4-saved-calc-card').forEach((card) => {
    const detailsButton = card.querySelector('[data-v2-calc-details]');
    const actions = card.querySelector('.v4-saved-calc-actions');
    const id = detailsButton?.dataset.v2CalcDetails;
    if (!id || !actions || actions.querySelector('[data-revision-edit]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v4-primary';
    button.dataset.revisionEdit = id;
    button.textContent = 'Внести правки';
    actions.prepend(button);
  });
}

function openBlankEditor() {
  editor = {
    source: null,
    title: '',
    needId: '',
    publicComment: '',
    rows: [blankRow()],
    error: ''
  };
  renderEditor();
  editorHost()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => byId('revisionTitle')?.focus(), 250);
}

async function openRevisionEditor(id) {
  if (loading) return;
  const calc = calcById(id);
  if (!calc) {
    toast('Расчёт не найден. Обновите список.');
    return;
  }
  loading = true;
  setStatus('Загружаю расчёт для правок...', 'warn');
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select(ITEM_FIELDS)
        .eq('calculation_id', calc.id)
        .order('sort_order', { ascending: true }),
      12000,
      'Позиции расчёта не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    editor = {
      source: calc,
      title: calc.title || 'Расчёт',
      needId: calc.need_id || '',
      publicComment: calc.public_comment || '',
      rows: (response.data || []).map(normalizeRow),
      error: ''
    };
    if (!editor.rows.length) editor.rows = [blankRow()];
    renderEditor();
    editorHost()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStatus('Расчёт открыт для правок. Исходная версия сохранится.', 'good');
  } catch (error) {
    const message = friendlyError(error);
    editor = null;
    renderEditor();
    setStatus(`Ошибка загрузки расчёта: ${message}`, 'error');
    toast(message);
  } finally {
    loading = false;
  }
}

function applyMarkup(percent) {
  if (!editor) return;
  const factor = 1 + Number(percent || 0) / 100;
  editor.rows = editor.rows.map((row) => ({
    ...row,
    client_price: Math.ceil(Math.max(0, num(row.contractor_price)) * factor / 10) * 10
  }));
  renderEditor();
  toast(`Применена наценка ${percent}%`);
}

function validateEditor() {
  if (!editor) return 'Редактор не открыт';
  const rows = editor.rows.map(normalizeRow);
  if (!rows.length) return 'Добавьте хотя бы одну позицию';
  for (const [index, row] of rows.entries()) {
    if (!String(row.name || '').trim()) return `Укажите название позиции ${index + 1}`;
    if (num(row.qty) <= 0) return `Количество в позиции ${index + 1} должно быть больше 0`;
    if (num(row.contractor_price) < 0 || num(row.client_price) < 0) return `Цены в позиции ${index + 1} не могут быть отрицательными`;
  }
  const result = totals(rows);
  if (result.client <= 0) return 'Сумма клиенту должна быть больше 0';
  if (result.profit < 0) return 'Расчёт убыточный. Исправьте цену клиенту';
  return '';
}

async function saveRevision() {
  if (!editor || saving || !v4State.route.leadId) return;
  editor.title = byId('revisionTitle')?.value?.trim() || editor.title;
  editor.needId = byId('revisionNeedId')?.value || '';
  editor.publicComment = byId('revisionPublicComment')?.value?.trim() || '';

  const validationError = validateEditor();
  if (validationError) {
    editor.error = validationError;
    renderEditor();
    toast(validationError);
    return;
  }

  saving = true;
  editor.error = '';
  renderEditor();
  setStatus('Сохраняю новую версию расчёта...', 'warn');
  try {
    const source = editor.source;
    const response = await supabaseClient.rpc('leader_create_calculation_revision', {
      p_lead_id: v4State.route.leadId,
      p_source_calculation_id: source?.id || null,
      p_title: editor.title || (source ? `${source.title || 'Расчёт'} — новая версия` : 'Новый расчёт'),
      p_need_id: editor.needId || null,
      p_public_comment: editor.publicComment || null,
      p_internal_comment: source
        ? `Новая версия расчёта ${source.version_number || 1}. Исходный расчёт: ${source.id}`
        : 'Новый расчёт создан в редакторе заявки',
      p_items: editor.rows.map((row) => ({
        catalog_id: row.catalog_id || null,
        category: row.category || 'Ручная позиция',
        item_type: row.item_type || 'Изготовление',
        name: row.name,
        unit: row.unit || 'шт',
        qty: num(row.qty),
        contractor_price: num(row.contractor_price),
        client_price: num(row.client_price),
        comment: row.comment || '',
        data: { ...(row.data || {}), revision_source_calculation_id: source?.id || null }
      }))
    }, {
      timeoutMs: 20000,
      timeoutMessage: 'Новая версия расчёта не сохранилась за 20 секунд'
    });
    if (response.error) throw response.error;
    const saved = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!saved?.id) throw new Error('Supabase не вернул сохранённый расчёт');

    setState({ calculations: [saved, ...(v4State.calculations || []).filter((calc) => calc.id !== saved.id)] });
    const savedTitle = saved.title || editor.title || 'Расчёт';
    editor = null;
    renderEditor();
    document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { leadId: v4State.route.leadId } }));
    setStatus(`Новая версия «${savedTitle}» сохранена. Можно сформировать новое КП.`, 'good');
    toast('Новая версия расчёта сохранена');
    scheduleDecorate();
  } catch (error) {
    const message = friendlyError(error);
    editor.error = message;
    renderEditor();
    setStatus(`Ошибка сохранения версии: ${message}`, 'error');
    toast(message);
  } finally {
    saving = false;
    renderEditor();
  }
}

function bind() {
  ensureRevisionStyles();
  document.addEventListener('click', async (event) => {
    const edit = event.target.closest?.('[data-revision-edit]');
    if (edit) {
      await openRevisionEditor(edit.dataset.revisionEdit);
      return;
    }
    if (event.target.closest?.('[data-revision-new]')) {
      openBlankEditor();
      return;
    }
    if (event.target.closest?.('[data-revision-cancel]')) {
      editor = null;
      renderEditor();
      return;
    }
    if (event.target.closest?.('[data-revision-add-row]')) {
      editor?.rows.push(blankRow());
      renderEditor();
      return;
    }
    const remove = event.target.closest?.('[data-revision-remove]');
    if (remove && editor) {
      editor.rows.splice(Number(remove.dataset.revisionRemove), 1);
      if (!editor.rows.length) editor.rows.push(blankRow());
      renderEditor();
      return;
    }
    const markup = event.target.closest?.('[data-revision-markup]');
    if (markup) {
      applyMarkup(Number(markup.dataset.revisionMarkup));
      return;
    }
    if (event.target.closest?.('[data-revision-save]')) await saveRevision();
  });

  document.addEventListener('input', (event) => {
    if (!editor) return;
    if (event.target.id === 'revisionTitle') { editor.title = event.target.value; return; }
    if (event.target.id === 'revisionPublicComment') { editor.publicComment = event.target.value; return; }
    const field = event.target.closest?.('[data-revision-field]');
    if (!field) return;
    const index = Number(field.dataset.index);
    if (!editor.rows[index]) return;
    editor.rows[index][field.dataset.revisionField] = field.value;
    renderTotals();
  });

  document.addEventListener('change', (event) => {
    if (!editor) return;
    if (event.target.id === 'revisionNeedId') { editor.needId = event.target.value; return; }
    const field = event.target.closest?.('[data-revision-field]');
    if (!field) return;
    const index = Number(field.dataset.index);
    if (!editor.rows[index]) return;
    editor.rows[index][field.dataset.revisionField] = field.value;
    renderTotals();
  });

  document.addEventListener('leader-v4:lead-card-rendered', () => {
    scheduleDecorate();
    renderEditor();
  });
  document.addEventListener('leader-v4:route-change', () => {
    editor = null;
    renderEditor();
    scheduleDecorate();
  });
  document.addEventListener('leader-v4:needs-loaded', renderEditor);

  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.body, { childList: true, subtree: true });
}

bind();
scheduleDecorate();
