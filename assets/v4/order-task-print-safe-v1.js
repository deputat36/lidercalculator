import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { toast } from './ui.js';

let lastOrderId = '';

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const dt = (value) => { if (!value) return '—'; try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); } };

function asData(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function orderIdFromScreen() {
  return window.LeaderV4CurrentOrderId || lastOrderId || document.querySelector('#orderProductionControlBox [data-save-production-info]')?.dataset.saveProductionInfo || '';
}

async function fetchOrderBundle(orderId) {
  const orderResponse = await supabaseClient.from('leader_orders').select('*').eq('id', orderId).single();
  if (orderResponse.error || !orderResponse.data) throw orderResponse.error || new Error('Заказ не найден');
  const itemsResponse = await supabaseClient.from('leader_order_items').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  const order = orderResponse.data;
  const data = asData(order.data);
  const fallbackRows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.items) ? data.items : [];
  return { order, items: itemsResponse.error ? fallbackRows : (itemsResponse.data || fallbackRows) };
}

function rowName(row) {
  return row.name || row.title || 'Позиция';
}

function rowQty(row) {
  return row.quantity || row.qty || row.count || 1;
}

function rowWidth(row) {
  return row.width || row.w || row.data?.width || '';
}

function rowHeight(row) {
  return row.height || row.h || row.data?.height || '';
}

function printHtml(bundle) {
  const { order, items } = bundle;
  const data = asData(order.data);
  const rows = items.length ? items.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(rowName(row))}</td><td>${esc(rowQty(row))} ${esc(row.unit || '')}</td><td>${rowWidth(row) || rowHeight(row) ? `${esc(rowWidth(row) || '—')}×${esc(rowHeight(row) || '—')}` : '—'}</td><td>${esc(row.comment || row.note || '')}</td></tr>`).join('') : '<tr><td colspan="5">Позиции не найдены. Проверьте расчёт / КП.</td></tr>';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Задание в производство</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111827}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:18px 0 8px}.muted{color:#64748b}.notice{border:2px solid #86efac;background:#ecfdf5;color:#065f46;border-radius:10px;padding:10px;margin:12px 0;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.box{border:1px solid #cbd5e1;border-radius:10px;padding:9px}.box span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}.box b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9}.sign{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}.line{border-top:1px solid #111827;padding-top:6px}</style></head><body><p class="muted">РА «Лидер» · Задание в производство · ${new Date().toLocaleString('ru-RU')}</p><h1>${esc(order.project_name || `Заказ №${order.order_number || String(order.id || '').slice(0, 8)}`)}</h1><div class="notice">Безопасный производственный лист. Не содержит имя, телефон и контакты клиента.</div><div class="grid"><div class="box"><span>Заказ</span><b>№${esc(order.order_number || String(order.id || '').slice(0, 8))}</b></div><div class="box"><span>Срок</span><b>${dt(order.deadline)}</b></div><div class="box"><span>Статус</span><b>${esc(order.status || '—')}</b></div><div class="box"><span>Макет</span><b>${esc(order.layout_status || data.layout_status || '—')}</b></div><div class="box"><span>Место размещения / монтаж</span><b>${esc(order.installation_address || data.install_place || data.installPlace || '—')}</b></div><div class="box"><span>Тип заказа</span><b>${esc(order.order_type || data.order_type || data.orderType || '—')}</b></div></div><h2>Файлы</h2><p><b>Макет:</b> ${esc(order.layout_link || data.layout_link || 'не указан')}</p><p><b>Фото места:</b> ${esc(data.place_photo_link || data.photo_place || 'не указано')}</p><h2>Техническое задание</h2><div class="box">${esc(order.production_comment || data.production_comment || data.comment || 'ТЗ не заполнено')}</div><h2>Состав работ</h2><table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Размер</th><th>Комментарий</th></tr></thead><tbody>${rows}</tbody></table><div class="sign"><div class="line">Передал</div><div class="line">Принял / выполнил</div></div><script>window.print();<\/script></body></html>`;
}

async function safePrintOrderTask() {
  const orderId = orderIdFromScreen();
  if (!orderId) {
    toast('Не удалось определить заказ для печати');
    return;
  }
  try {
    const bundle = await fetchOrderBundle(orderId);
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Браузер заблокировал окно печати');
    win.document.open();
    win.document.write(printHtml(bundle));
    win.document.close();
  } catch (error) {
    toast(friendlyError(error));
  }
}

function boot() {
  document.addEventListener('click', (event) => {
    const openOrder = event.target.closest?.('[data-open-order]');
    if (openOrder?.dataset.openOrder) {
      lastOrderId = openOrder.dataset.openOrder;
      window.LeaderV4CurrentOrderId = lastOrderId;
    }
    const print = event.target.closest?.('[data-print-order-task]');
    if (!print) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    safePrintOrderTask();
  }, true);
}

if (!window.LeaderV4OrderTaskPrintSafeV1Booted) {
  window.LeaderV4OrderTaskPrintSafeV1Booted = true;
  boot();
}
