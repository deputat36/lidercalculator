import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

let booted = false;
let busy = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const nowIso = () => new Date().toISOString();
const tomorrowLocal = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function ensureStyles() {
  if (document.getElementById('orderInstallationCreateV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderInstallationCreateV1Styles';
  style.textContent = `
    .v4-install-create{border:1px solid #bfdbfe;background:#eff6ff;border-radius:18px;padding:14px;margin-top:12px;color:#1e3a8a}.v4-install-create h4{margin:0 0 8px}.v4-install-create p{margin:0 0 10px;font-weight:800}.v4-install-create-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.v4-install-create-actions .v4-primary{background:#2563eb;color:#fff;border-color:#2563eb}@media(max-width:720px){.v4-install-create-actions{display:grid}.v4-install-create-actions button{width:100%}}
  `;
  document.head.appendChild(style);
}

function panel() {
  return document.getElementById('orderProductionControlBox');
}

function currentOrderId() {
  return panel()?.querySelector('[data-create-production-job]')?.dataset.createProductionJob
    || panel()?.querySelector('[data-save-production-info]')?.dataset.saveProductionInfo
    || window.LeaderV4CurrentOrderId
    || '';
}

async function fetchBundle(orderId) {
  const orderResponse = await supabaseClient.from('leader_orders').select('*').eq('id', orderId).single();
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const order = orderResponse.data;
  const [productionResponse, installResponse, orderItemsResponse] = await Promise.all([
    supabaseClient.from('leader_production_jobs').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(10),
    supabaseClient.from('leader_installation_jobs').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(20),
    supabaseClient.from('leader_order_items').select('*').eq('order_id', orderId).order('created_at', { ascending: true })
  ]);
  if (productionResponse.error) throw productionResponse.error;
  if (installResponse.error) throw installResponse.error;
  const productionJobs = productionResponse.data || [];
  let sourceItems = orderItemsResponse.error ? [] : orderItemsResponse.data || [];
  let productionItems = [];
  if (productionJobs[0]?.id) {
    const productionItemsResponse = await supabaseClient.from('leader_production_job_items').select('*').eq('job_id', productionJobs[0].id).order('created_at', { ascending: true });
    if (!productionItemsResponse.error) productionItems = productionItemsResponse.data || [];
  }
  if (!sourceItems.length && productionItems.length) sourceItems = productionItems;
  if (!sourceItems.length && Array.isArray(order.data?.rows)) sourceItems = order.data.rows;
  return { order, productionJobs, installs: installResponse.data || [], sourceItems };
}

function itemName(item) {
  return item.name || item.title || 'Позиция монтажа';
}

function itemQty(item) {
  return Number(item.qty || item.quantity || 1) || 1;
}

function renderBox(orderId) {
  const root = panel();
  if (!root || root.querySelector('#orderInstallationCreateBox')) return;
  const data = root.__installationCreateData || {};
  const existsCount = Number(data.installsCount || 0);
  root.insertAdjacentHTML('beforeend', `<section id="orderInstallationCreateBox" class="v4-install-create"><h4>Монтажное задание</h4><p>${existsCount ? `По заказу уже есть монтажных заданий: ${existsCount}. Можно создать ещё одно, если нужен отдельный выезд.` : 'Создайте монтажное задание, чтобы оно появилось на производственной доске в режиме «Монтаж».'}</p><div class="v4-form-grid"><label>Дата и время монтажа<input id="orderInstallScheduled" type="datetime-local" value="${tomorrowLocal()}"></label><label>Монтажник<input id="orderInstallInstaller" placeholder="ФИО монтажника"></label><label>Телефон монтажника<input id="orderInstallInstallerPhone" placeholder="+7..."></label><label class="wide">Адрес / место монтажа<input id="orderInstallAddress" value="${esc(data.address || '')}" placeholder="Адрес, фасад, окно, помещение"></label><label class="wide">Техническое задание<textarea id="orderInstallTask" rows="3" placeholder="Что именно установить, куда, как закрепить">${esc(data.task || '')}</textarea></label><label class="wide">Инструмент<textarea id="orderInstallTools" rows="2" placeholder="Лестница, перфоратор, саморезы, герметик..."></textarea></label></div><div class="v4-install-create-actions"><button type="button" class="v4-primary" data-create-installation-from-order="${esc(orderId)}" ${busy ? 'disabled' : ''}>${busy ? 'Создаю...' : 'Создать монтажное задание'}</button><button type="button" data-refresh-installation-create="${esc(orderId)}">Обновить проверку</button></div></section>`);
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
      address: bundle.order.installation_address || data.install_place || data.installPlace || '',
      task: bundle.order.production_comment || data.production_comment || bundle.order.internal_comment || ''
    };
    renderBox(orderId);
  } catch (error) {
    root.insertAdjacentHTML('beforeend', `<section id="orderInstallationCreateBox" class="v4-install-create"><h4>Монтажное задание</h4><p>Ошибка проверки монтажа: ${esc(friendlyError(error))}</p></section>`);
  }
}

function formValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

async function createInstallation(orderId) {
  if (busy) return;
  busy = true;
  try {
    setStatus('Создаю монтажное задание...', 'warn');
    const bundle = await fetchBundle(orderId);
    const { order, productionJobs, sourceItems } = bundle;
    const productionJob = productionJobs[0] || null;
    const scheduledRaw = formValue('orderInstallScheduled');
    const address = formValue('orderInstallAddress') || order.installation_address || order.data?.install_place || '';
    const installerName = formValue('orderInstallInstaller');
    const installerPhone = formValue('orderInstallInstallerPhone');
    const task = formValue('orderInstallTask') || order.production_comment || order.internal_comment || '';
    const tools = formValue('orderInstallTools');
    const data = order.data && typeof order.data === 'object' ? order.data : {};
    const jobPayload = {
      order_id: order.id,
      production_job_id: productionJob?.id || null,
      title: `Монтаж: ${order.project_name || `заказ №${order.order_number || String(order.id).slice(0, 8)}`}`,
      install_status: scheduledRaw ? 'Запланирован' : 'Нужно назначить',
      priority: order.priority || order.production_priority || 'Обычный',
      installer_name: installerName || null,
      installer_phone: installerPhone || null,
      address: address || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      technical_task: task || null,
      tools_required: tools || null,
      installer_comment: task || null,
      internal_comment: 'Создано из карточки заказа',
      before_photo_url: data.place_photo_link || data.photo_place || null,
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    };
    const jobResponse = await supabaseClient.from('leader_installation_jobs').insert(jobPayload).select('*').single();
    if (jobResponse.error || !jobResponse.data) throw jobResponse.error || new Error('Монтажное задание не создано');
    const job = jobResponse.data;
    const rows = (sourceItems || []).map((item) => ({
      job_id: job.id,
      order_id: order.id,
      name: itemName(item),
      unit: item.unit || 'шт',
      qty: itemQty(item),
      width: item.width || item.data?.width || null,
      height: item.height || item.data?.height || null,
      installer_price: item.installer_price || 0,
      client_price: item.client_price || item.client_sum || 0,
      comment: item.comment || ''
    }));
    if (rows.length) await supabaseClient.from('leader_installation_job_items').insert(rows);
    await Promise.all([
      supabaseClient.from('leader_installation_events').insert({ job_id: job.id, order_id: order.id, event_type: 'Создан монтаж', new_status: job.install_status, body: 'Монтажное задание создано из карточки заказа', created_by: v4State.user?.id || null }),
      supabaseClient.from('leader_orders').update({ installation_status: job.install_status, installation_address: address || null, installation_scheduled_at: job.scheduled_at || null, installer_name: installerName || null, installer_phone: installerPhone || null, current_stage: `Монтаж: ${job.install_status}`, progress_percent: Math.max(Number(order.progress_percent || 0), 70), updated_at: nowIso(), stage_updated_at: nowIso() }).eq('id', order.id)
    ]);
    toast('Монтажное задание создано');
    setStatus('Монтажное задание создано', 'good');
    const old = document.getElementById('orderInstallationCreateBox');
    if (old) old.remove();
    await enhance(true);
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { ...order, installation_status: job.install_status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка создания монтажа: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const create = event.target.closest?.('[data-create-installation-from-order]');
    if (create) {
      event.preventDefault();
      event.stopPropagation();
      createInstallation(create.dataset.createInstallationFromOrder);
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
