import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let lastLeadId = null;
let loadedLeadId = null;
let loadingLeadId = null;
let selectedId = null;
let selectedItems = [];
let detailsBusy = false;
let detailsError = '';
let renderTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function host() {
  return byId('calculationsBox');
}

function resetIfLeadChanged() {
  const leadId = v4State.route.leadId || null;
  if (lastLeadId === leadId) return;
  lastLeadId = leadId;
  selectedId = null;
  selectedItems = [];
  detailsBusy = false;
  detailsError = '';
}

async function loadCalculations(force = false) {
  const leadId = v4State.route.leadId || null;
  if (!leadId || !v4State.crmReady) return;
  if (!force && loadingLeadId === leadId) return;
  if (!force && loadedLeadId === leadId && Array.isArray(v4State.calculations) && !v4State.calculationsBusy) {
    scheduleRender();
    return;
  }

  loadingLeadId = leadId;
  setState({ calculationsBusy: true, calculationsError: '' });
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
    if (v4State.route.leadId !== leadId) return;
    loadedLeadId = leadId;
    setState({ calculations: response.data || [], calculationsBusy: false, calculationsError: '' });
  } catch (error) {
    loadedLeadId = null;
    setState({ calculations: [], calculationsBusy: false, calculationsError: friendlyError(error) });
  } finally {
    if (loadingLeadId === leadId) loadingLeadId = null;
    scheduleRender();
  }
}

function calcClass(calc) {
  if (calc.order_id) return ' is-good';
  if (calc.commercial_offer_id) return ' is-warn';
  return '';
}

function renderCalc(calc) {
  const active = calc.id === selectedId ? ' is-active' : '';
  return `
    <article class="v4-saved-calc-card${active}${calcClass(calc)}">
      <div>
        <div class="v4-saved-calc-title"><h4>${esc(calc.title || 'Расчёт')}</h4><span>${esc(calc.status || 'Черновик')}</span></div>
        <div class="v4-saved-calc-meta">
          <span><b>Клиенту:</b> ${money(calc.client_total)}</span>
          <span><b>Себест.:</b> ${money(calc.contractor_cost)}</span>
          <span><b>Прибыль:</b> ${money(calc.profit)}</span>
          <span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span>
          ${calc.commercial_offer_id ? '<span>Есть КП</span>' : ''}
          ${calc.order_id ? '<span>Есть заказ</span>' : ''}
        </div>
      </div>
      <div class="v4-saved-calc-actions">
        <button type="button" data-v2-calc-details="${esc(calc.id)}">Состав</button>
        <button type="button" data-v2-calc-refresh>Обновить</button>
      </div>
    </article>`;
}

function renderDetails() {
  const calc = (v4State.calculations || []).find((item) => item.id === selectedId);
  if (!selectedId) return '<div class="v4-empty">Выберите расчёт и нажмите «Состав», чтобы посмотреть строки.</div>';
  if (detailsBusy) return '<div class="v4-empty">Загружаю состав расчёта...</div>';
  if (detailsError) return `<div class="v4-empty is-error">${esc(detailsError)}</div>`;
  if (!calc) return '<div class="v4-empty is-error">Расчёт не найден.</div>';
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
    </tr>`).join('');

  return `
    <div class="v4-saved-calc-details">
      <div class="v4-subcard-head">
        <div><h3>Состав расчёта: ${esc(calc.title || 'Расчёт')}</h3><p>Создан: ${dateRu(calc.created_at)}. Эти строки используются для КП и заказа.</p></div>
        <button type="button" data-v2-calc-close>Скрыть состав</button>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table v4-saved-calc-table">
          <thead><tr><th>Позиция</th><th>Категория</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма</th><th>Маржа</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function render() {
  resetIfLeadChanged();
  const box = host();
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '<div class="v4-empty">Выберите заявку из списка.</div>';
    return;
  }
  const calculations = v4State.calculations || [];
  box.className = 'v4-calculations-host v4-saved-calc-host';
  box.innerHTML = `
    <section class="v4-subcard v4-saved-calc-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Сохранённые расчёты</h3>
          <p>Здесь только уже сохранённые варианты. Новые расчёты создаются ниже: сначала типовой, затем нестандартный.</p>
        </div>
        <div class="v4-form-actions"><button type="button" data-v2-calc-refresh>Обновить</button></div>
      </div>
      <div class="v4-saved-calc-list">
        ${v4State.calculationsBusy ? '<div class="v4-empty">Загружаю расчёты...</div>' : v4State.calculationsError ? `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>` : calculations.length ? calculations.map(renderCalc).join('') : '<div class="v4-empty">Сохранённых расчётов пока нет. Ниже можно создать типовой или нестандартный расчёт.</div>'}
      </div>
      ${renderDetails()}
    </section>`;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 40);
}

async function loadItems(id) {
  selectedId = id;
  selectedItems = [];
  detailsError = '';
  detailsBusy = true;
  render();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select(ITEM_FIELDS)
        .eq('calculation_id', id)
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

function bind() {
  document.addEventListener('leader-v4:lead-card-rendered', () => {
    render();
    loadCalculations(false);
  });
  document.addEventListener('leader-v4:route-change', () => {
    loadedLeadId = null;
    lastLeadId = null;
    selectedId = null;
    selectedItems = [];
    detailsError = '';
    render();
    setTimeout(() => loadCalculations(true), 80);
  });
  document.addEventListener('leader-v4:crm-ready', () => loadCalculations(false));
  document.addEventListener('click', async (event) => {
    const details = event.target.closest?.('[data-v2-calc-details]');
    if (details) {
      await loadItems(details.dataset.v2CalcDetails);
      return;
    }
    if (event.target.closest?.('[data-v2-calc-close]')) {
      selectedId = null;
      selectedItems = [];
      detailsError = '';
      render();
      return;
    }
    if (event.target.closest?.('[data-v2-calc-refresh]')) {
      toast('Обновляю расчёты');
      await loadCalculations(true);
    }
  });
}

bind();
scheduleRender();
