import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,deadline,contractor_cost,client_total,layout_status,layout_link,data,production_priority,priority,production_comment,internal_comment,progress_percent,installation_address,client_name,client_phone';
const ORDER_ITEM_FIELDS = 'id,name,unit,quantity,contractor_price,client_sum,comment,data,created_at';
const PRODUCTION_JOB_FIELDS = 'id,order_id,title,production_status,created_at,updated_at';
const PRODUCTION_ITEM_FIELDS = 'id,job_id,order_id,name,unit,qty,width,height,contractor_price,client_price,comment,created_at';
const INSTALLATION_JOB_FIELDS = 'id,order_id,production_job_id,title,client_name,client_phone,install_status,priority,installer_name,installer_phone,address,scheduled_at,installer_cost,client_price,technical_task,tools_required,client_comment,installer_comment,internal_comment,before_photo_url,created_at,updated_at';

let booted = false;
let busy = false;

const CLOSED_INSTALL_STATUSES = ['Выполнен', 'Закрыт', 'Отменён', 'Отменено'];
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const nowIso = () => new Date().toISOString();
const tomorrowLocal = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const toLocal = (value) => {
  if (!value) return tomorrowLocal();
  try {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  } catch (_) {
    return tomorrowLocal();
  }
};

function ensureStyles() {
  if (document.getElementById('orderInstallationCreateV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderInstallationCreateV1Styles';
  style.textContent = `
    .v4-install-create{border:1px solid #bfdbfe;background:#eff6ff;border-radius:18px;padding:14px;margin-top:12px;color:#1e3a8a}.v4-install-create h4{margin:0 0 8px}.v4-install-create p{margin:0 0 10px;font-weight:800}.v4-install-create-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-install-create-actions .v4-primary{background:#2563eb;color:#fff;border-color:#2563eb}.v4-install-create-actions .v4-secondary{background:#fff;color:#1d4ed8;border-color:#93c5fd}@media(max-width:720px){.v4-install-create-actions{display:grid}.v4-install-create-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function panel() { return document.getElementById('orderProductionControlBox'); }
function currentOrderId() {
  return panel()?.querySelector('[data-save-production-info]')?.dataset.saveProductionInfo
    || panel()?.querySelector('[data-create-production-job-safe]')?.dataset.createProductionJobSafe
    || panel()?.querySelector('[data-create-production-job]')?.dataset.createProductionJob
    || window.LeaderV4CurrentOrderId
    || '';
}
function isOpenInstall(job) { return !CLOSED_INSTALL_STATUSES.includes(job.install_status || ''); }

async function fetchBundle(orderId) {
  const orderResponse = await supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single();
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const order = orderResponse.data;
  const [productionResponse, installResponse, orderItemsResponse] = await Promise.all([
    supabaseClient.from('leader_production_jobs').select(PRODUCTION_JOB_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(10),
    supabaseClient.from('leader_installation_jobs').select(INSTALLATION_JOB_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
    supabaseClient.from('leader_order_items').select(ORDER_ITEM_FIELDS).eq('order_id', orderId).order('created_at', { ascending: true }).limit(120)
  ]);
  if (productionResponse.error) throw productionResponse.error;
  if (installResponse.error) throw installResponse.error;
  const productionJobs = productionResponse.data || [];
  let sourceItems = orderItemsResponse.error ? [] : orderItemsResponse.data || [];
  let productionItems = [];
  if (productionJobs[0]?.id) {
    const productionItemsResponse = await supabaseClient.from('leader_production_job_items').select(PRODUCTION_ITEM_FIELDS).eq('job_id', productionJobs[0].id).order('created_at', { ascending: true }).limit(160);
    if (!productionItemsResponse.error) productionItems = productionItemsResponse.data || [];
  }
  if (!sourceItems.length && productionItems.length) sourceItems = productionItems;
  if (!sourceItems.length && Array.isArray(order.data?.rows)) sourceItems = order.data.rows;
  return { order, productionJobs, installs: installResponse.data || [], sourceItems };
}

function itemName(item) { return item.name || item.title || 'Позиция монтажа'; }
function itemQty(item) { return Number(item.qty || item.quantity || 1) || 1; }
function firstOpenInstall(installs = []) { return installs.find(isOpenInstall) || null; }

function renderBox(orderId) {
  const root = panel();
  if (!root || root.querySelector('#orderInstallationCreateBox')) return;
  const data = root.__installationCreateData || {};
  const existsCount = Number(data.installsCount || 0);
  const openInstall = data.openInstall || null;
  const scheduled = toLocal(openInstall?.scheduled_at || '');
  const title = openInstall ? 'Обновить монтажное задание' : 'Создать монтажное задание';
  const leadText = openInstall
    ? `По заказу уже есть открытое монтажное задание: ${esc(openInstall.title || 'Монтаж')} (${esc(openInstall.install_status || '—')}). По умолчанию кнопка обновит его, чтобы не создавать дубль.`
    : existsCount
      ? `По заказу уже есть монтажных заданий: ${existsCount}. Открытых нет, можно создать новый выезд.`
      : 'Создайте монтажное задание, чтобы оно появилось на производственной доске в режиме «Монтаж».';
  root.insertAdjacentHTML('beforeend', `<section id="orderInstallationCreateBox" class="v4-install-create"><h4>Монтажное задание</h4><p>${leadText}</p><div class="v4-form-grid"><label>Дата и время монтажа<input id="orderInstallScheduled" type="datetime-local" value="${scheduled}"></label><label>Монтажник<input id="orderInstallInstaller" value="${esc(openInstall?.installer_name || '')}" placeholder="ФИО монтажника"></label><label>Телефон монтажника<input id="orderInstallInstallerPhone" value="${esc(openInstall?.installer_phone || '')}" placeholder="+7..."></label><label class="wide">Адрес / место монтажа<input id="orderInstallAddress" value="${esc(openInstall?.address || data.address || '')}" placeholder="Адрес, фасад, окно, помещение"></label><label class="wide">Техническое задание<textarea id="orderInstallTask" rows="3" placeholder="Что именно установить, куда, как закрепить">${esc(openInstall?.technical_task || data.task || '')}</textarea></label><label class="wide">Инструмент<textarea id="orderInstallTools" rows="2" placeholder="Лестница, перфоратор, саморезы, герметик...">${esc(openInstall?.tools_required || '')}</textarea></label></div><div class="v4-install-create-actions"><button type="button" class="v4-primary" data-upsert-installation-from-order="${esc(orderId)}" ${busy ? 'disabled' : ''}>${busy ? 'Сохраняю...' : title}</button>${openInstall ? `<button type="button" class="v4-secondary" data-create-extra-installation-from-order="${esc(orderId)}">Создать отдельный выезд</button>` : ''}<button type="button" data-refresh-installation-create="${esc(orderId)}">Обновить проверку</button></div></section>`);
}

async function enhance(force = false) {
  const orderId = currentOrderId();
  const root = panel();
  if (!orderId || !root) return;
  if (!force && root.querySelector('#orderInstallationCreateBox')) return;
  const old = root.querySelector('#orderInstallationCreateBox');
  if (old) old.remove();
  try {
    const bundle = await fetchBundle(orderId);
    const data = bundle.order.data && typeof bundle.order.data === 'object' ? bundle.order.data : {};
    root.__installationCreateData = {
      installsCount: bundle.installs.length,
      openInstall: firstOpenInstall(bundle.installs),
      address: bundle.order.installation_address || data.install_place || data.installPlace || '',
      task: bundle.order.production_comment || data.production_comment || bundle.order.internal_comment || ''
    };
    renderBox(orderId);
  } catch (error) {
    root.insertAdjacentHTML('beforeend', `<section id="orderInstallationCreateBox" class="v4-install-create"><h4>Монтажное задание</h4><p>Ошибка проверки монтажа: ${esc(friendlyError(error))}</p></section>`);
  }
}

function formValue(id) { return document.getElementById(id)?.value?.trim() || ''; }
function buildJobPayload(order, productionJob, forceNew = false) {
  const scheduledRaw = formValue('orderInstallScheduled');
  const data = order.data && typeof order.data === 'object' ? order.data : {};
  const address = formValue('orderInstallAddress') || order.installation_address || data.install_place || '';
  const installerName = formValue('orderInstallInstaller');
  const installerPhone = formValue('orderInstallInstallerPhone');
  const task = formValue('orderInstallTask') || order.production_comment || order.internal_comment || '';
  const tools = formValue('orderInstallTools');
  return {
    order_id: order.id,
    production_job_id: productionJob?.id || null,
    title: `Монтаж: ${order.project_name || `заказ №${order.order_number || String(order.id).slice(0, 8)}`}${forceNew ? ' — отдельный выезд' : ''}`,
    client_name: order.client_name || null,
    client_phone: order.client_phone || null,
    install_status: scheduledRaw ? 'Запланирован' : 'Нужно назначить',
    priority: order.priority || order.production_priority || 'Обычный',
    installer_name: installerName || null,
    installer_phone: installerPhone || null,
    address: address || null,
    scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
    technical_task: task || null,
    tools_required: tools || null,
    installer_comment: task || null,
    internal_comment: forceNew ? 'Создан отдельный выезд из карточки заказа' : 'Создано/обновлено из карточки заказа',
    before_photo_url: data.place_photo_link || data.photo_place || null,
    updated_by: v4State.user?.id || null,
    updated_at: nowIso()
  };
}

async function replaceInstallItems(jobId, orderId, sourceItems = []) {
  const deleteResponse = await supabaseClient.from('leader_installation_job_items').delete().eq('job_id', jobId);
  if (deleteResponse.error) throw deleteResponse.error;
  const rows = sourceItems.map((item) => ({
    job_id: jobId,
    order_id: orderId,
    name: itemName(item),
    unit: item.unit || 'шт',
    qty: itemQty(item),
    width: item.width || item.data?.width || null,
    height: item.height || item.data?.height || null,
    installer_price: item.installer_price || 0,
    client_price: item.client_price || item.client_sum || 0,
    comment: item.comment || ''
  }));
  if (rows.length) {
    const insertResponse = await supabaseClient.from('leader_installation_job_items').insert(rows);
    if (insertResponse.error) throw insertResponse.error;
  }
}

async function upsertInstallation(orderId, forceNew = false) {
  if (busy) return;
  busy = true;
  try {
    setStatus(forceNew ? 'Создаю отдельный монтажный выезд...' : 'Сохраняю монтажное задание...', 'warn');
    const bundle = await fetchBundle(orderId);
    const { order, productionJobs, sourceItems, installs } = bundle;
    const productionJob = productionJobs[0] || null;
    const openInstall = forceNew ? null : firstOpenInstall(installs);
    const payload = buildJobPayload(order, productionJob, forceNew);
    let job = null;
    let eventType = '';
    let oldStatus = null;
    if (openInstall) {
      oldStatus = openInstall.install_status || null;
      const response = await supabaseClient.from('leader_installation_jobs').update(payload).eq('id', openInstall.id).select(INSTALLATION_JOB_FIELDS).single();
      if (response.error || !response.data) throw response.error || new Error('Монтажное задание не обновлено');
      job = response.data;
      eventType = 'Обновлён монтаж';
      await replaceInstallItems(job.id, order.id, sourceItems);
    } else {
      const response = await supabaseClient.from('leader_installation_jobs').insert({ ...payload, created_by: v4State.user?.id || null }).select(INSTALLATION_JOB_FIELDS).single();
      if (response.error || !response.data) throw response.error || new Error('Монтажное задание не создано');
      job = response.data;
      eventType = forceNew ? 'Создан отдельный монтаж' : 'Создан монтаж';
      await replaceInstallItems(job.id, order.id, sourceItems);
    }
    await Promise.all([
      supabaseClient.from('leader_installation_events').insert({ job_id: job.id, order_id: order.id, event_type: eventType, old_status: oldStatus, new_status: job.install_status, body: openInstall ? 'Монтажное задание обновлено из карточки заказа без создания дубля' : 'Монтажное задание создано из карточки заказа', created_by: v4State.user?.id || null }),
      supabaseClient.from('leader_orders').update({ installation_status: job.install_status, installation_address: payload.address || null, installation_scheduled_at: job.scheduled_at || null, installer_name: payload.installer_name || null, installer_phone: payload.installer_phone || null, current_stage: `Монтаж: ${job.install_status}`, progress_percent: Math.max(Number(order.progress_percent || 0), 70), updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', order.id)
    ]);
    toast(openInstall ? 'Монтажное задание обновлено' : 'Монтажное задание создано');
    setStatus(openInstall ? 'Монтажное задание обновлено без дубля' : 'Монтажное задание создано', 'good');
    const old = document.getElementById('orderInstallationCreateBox');
    if (old) old.remove();
    await enhance(true);
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { ...order, installation_status: job.install_status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const upsert = event.target.closest?.('[data-upsert-installation-from-order]');
    if (upsert) {
      event.preventDefault();
      event.stopPropagation();
      upsertInstallation(upsert.dataset.upsertInstallationFromOrder, false);
      return;
    }
    const extra = event.target.closest?.('[data-create-extra-installation-from-order]');
    if (extra) {
      event.preventDefault();
      event.stopPropagation();
      upsertInstallation(extra.dataset.createExtraInstallationFromOrder, true);
      return;
    }
    const legacy = event.target.closest?.('[data-create-installation-from-order]');
    if (legacy) {
      event.preventDefault();
      event.stopPropagation();
      upsertInstallation(legacy.dataset.createInstallationFromOrder, false);
      return;
    }
    const refresh = event.target.closest?.('[data-refresh-installation-create]');
    if (refresh) {
      event.preventDefault();
      event.stopPropagation();
      const old = document.getElementById('orderInstallationCreateBox');
      if (old) old.remove();
      enhance(true);
    }
  }, true);
  document.addEventListener('leader-v4-order-updated', () => setTimeout(() => enhance(true), 450));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-open-order]')) setTimeout(() => enhance(true), 900);
  });
  new MutationObserver(() => enhance(false)).observe(document.body, { childList: true, subtree: true });
  setTimeout(() => enhance(true), 900);
}

boot();
