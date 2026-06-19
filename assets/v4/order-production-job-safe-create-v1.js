import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const ORDER_FIELDS = 'id,order_number,project_name,status,deadline,contractor_cost,client_total,layout_status,layout_link,data,production_priority,priority,production_comment,internal_comment,progress_percent';
const ORDER_ITEM_FIELDS = 'id,name,unit,quantity,contractor_price,client_sum,comment,data,created_at';
const PRODUCTION_JOB_FIELDS = 'id,order_id,title,production_status,layout_status,priority,deadline,contractor_cost,client_total,file_url,technical_task,internal_comment,created_at,updated_at';

let busy = false;
let booted = false;

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const nowIso = () => new Date().toISOString();

function orderRows(order, orderItems = []) {
  if (orderItems.length) return orderItems.map((item) => ({
    name: item.name || 'Позиция',
    unit: item.unit || 'шт',
    qty: item.quantity || item.qty || 1,
    contractor_price: item.contractor_price || 0,
    client_price: item.client_sum && item.quantity ? Number(item.client_sum) / Number(item.quantity || 1) : Number(item.client_price || item.client_sum || 0),
    comment: item.comment || '',
    width: item.width || item.data?.width || null,
    height: item.height || item.data?.height || null
  }));
  const data = order?.data && typeof order.data === 'object' ? order.data : {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  return rows.map((row) => ({
    name: row.name || row.title || 'Позиция',
    unit: row.unit || 'шт',
    qty: row.qty || row.quantity || 1,
    contractor_price: row.price || row.contractor_price || 0,
    client_price: row.client_price || row.clientPrice || row.client_sum || 0,
    comment: row.comment || row.note || '',
    width: row.width || row.w || row.data?.width || null,
    height: row.height || row.h || row.data?.height || null
  }));
}

async function fetchBundle(orderId) {
  const orderResponse = await supabaseClient.from('leader_orders').select(ORDER_FIELDS).eq('id', orderId).single();
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const order = orderResponse.data;
  const [itemsResponse, jobsResponse] = await Promise.all([
    supabaseClient.from('leader_order_items').select(ORDER_ITEM_FIELDS).eq('order_id', orderId).order('created_at', { ascending: true }).limit(120),
    supabaseClient.from('leader_production_jobs').select(PRODUCTION_JOB_FIELDS).eq('order_id', orderId).order('created_at', { ascending: false }).limit(10)
  ]);
  if (itemsResponse.error) throw itemsResponse.error;
  if (jobsResponse.error) throw jobsResponse.error;
  return { order, items: itemsResponse.data || [], jobs: jobsResponse.data || [] };
}

function patchFromOrder(order) {
  const data = order.data && typeof order.data === 'object' ? order.data : {};
  return {
    title: order.project_name || `Заказ №${order.order_number || order.id}`,
    layout_status: order.layout_status || 'Макет не проверен',
    priority: order.production_priority || order.priority || 'Обычная',
    deadline: order.deadline ? `${order.deadline}T18:00:00` : null,
    contractor_cost: order.contractor_cost || 0,
    client_total: order.client_total || 0,
    file_url: order.layout_link || data.layout_link || null,
    technical_task: order.production_comment || data.production_comment || data.comment || '',
    internal_comment: order.internal_comment || '',
    updated_at: nowIso()
  };
}

async function replaceProductionItems(jobId, orderId, rows) {
  const deleteResponse = await supabaseClient.from('leader_production_job_items').delete().eq('job_id', jobId);
  if (deleteResponse.error) throw deleteResponse.error;
  if (!rows.length) return;
  const items = rows.map((row) => ({
    job_id: jobId,
    order_id: orderId,
    name: row.name || 'Позиция',
    unit: row.unit || 'шт',
    qty: Number(row.qty || 1),
    width: row.width || null,
    height: row.height || null,
    contractor_price: Number(row.contractor_price || 0),
    client_price: Number(row.client_price || 0),
    comment: row.comment || ''
  }));
  const insertResponse = await supabaseClient.from('leader_production_job_items').insert(items);
  if (insertResponse.error) throw insertResponse.error;
}

async function createOrUpdateProductionJob(orderId) {
  if (busy) return;
  busy = true;
  try {
    setStatus('Проверяю производственное задание...', 'warn');
    const bundle = await fetchBundle(orderId);
    const { order, jobs } = bundle;
    const rows = orderRows(order, bundle.items);
    const existing = jobs.find((job) => !['Готово', 'Выдано', 'Отменено', 'Закрыто'].includes(job.production_status || '')) || jobs[0] || null;
    let job = null;
    if (existing) {
      const response = await supabaseClient
        .from('leader_production_jobs')
        .update(patchFromOrder(order))
        .eq('id', existing.id)
        .select(PRODUCTION_JOB_FIELDS)
        .single();
      if (response.error || !response.data) throw response.error || new Error('Производственное задание не обновлено');
      job = response.data;
      await replaceProductionItems(job.id, order.id, rows);
      await supabaseClient.from('leader_production_events').insert({
        job_id: job.id,
        order_id: order.id,
        event_type: 'Обновлено задание',
        old_status: existing.production_status || null,
        new_status: job.production_status || null,
        body: 'Производственное задание обновлено из карточки заказа без создания дубля',
        created_by: v4State.user?.id || null,
        created_by_email: v4State.user?.email || null
      });
      toast('Производственное задание обновлено');
      setStatus('Производственное задание обновлено без дубля', 'good');
    } else {
      const response = await supabaseClient
        .from('leader_production_jobs')
        .insert({ ...patchFromOrder(order), order_id: order.id, production_status: 'Не передано', created_by: v4State.user?.id || null })
        .select(PRODUCTION_JOB_FIELDS)
        .single();
      if (response.error || !response.data) throw response.error || new Error('Производственное задание не создано');
      job = response.data;
      await replaceProductionItems(job.id, order.id, rows);
      await supabaseClient.from('leader_production_events').insert({
        job_id: job.id,
        order_id: order.id,
        event_type: 'Создано задание',
        new_status: 'Не передано',
        body: 'Производственное задание создано из карточки заказа',
        created_by: v4State.user?.id || null,
        created_by_email: v4State.user?.email || null
      });
      toast('Производственное задание создано');
      setStatus('Производственное задание создано', 'good');
    }
    await supabaseClient.from('leader_orders').update({
      production_status: job.production_status || 'Не передано',
      current_stage: existing ? 'Производственное задание обновлено' : 'Производственное задание создано',
      progress_percent: Math.max(Number(order.progress_percent || 0), 35),
      updated_at: nowIso(),
      stage_updated_at: nowIso()
    }).eq('id', order.id);
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { ...order, production_status: job.production_status || 'Не передано' } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка производственного задания: ${friendlyError(error)}`, 'error');
  } finally {
    busy = false;
  }
}

function protectButtons() {
  document.querySelectorAll('[data-create-production-job]').forEach((button) => {
    const orderId = button.dataset.createProductionJob;
    if (!orderId) return;
    button.dataset.createProductionJobSafe = orderId;
    button.removeAttribute('data-create-production-job');
    button.textContent = button.textContent.includes('создать') || button.textContent.includes('Создать')
      ? 'Создать / обновить производственное задание'
      : 'Обновить производственное задание';
    button.title = 'Не создаёт дубль, если задание уже есть: обновляет существующее.';
  });
}

function boot() {
  if (booted) return;
  booted = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-create-production-job-safe]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    createOrUpdateProductionJob(button.dataset.createProductionJobSafe);
  }, true);
  document.addEventListener('leader-v4-order-updated', () => setTimeout(protectButtons, 350));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-open-order],[data-production-refresh]')) setTimeout(protectButtons, 600);
  });
  new MutationObserver(protectButtons).observe(document.body, { childList: true, subtree: true });
  setTimeout(protectButtons, 900);
}

boot();
