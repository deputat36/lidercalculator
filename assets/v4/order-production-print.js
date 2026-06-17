import { supabaseClient } from './supabase-client.js';

let currentOrderId = sessionStorage.getItem('leader_v4_current_order_id') || '';

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function dateRu(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function dataOf(order) {
  if (!order) return {};
  if (order.data && typeof order.data === 'object') return order.data;
  if (typeof order.data === 'string') {
    try { return JSON.parse(order.data); } catch (_) { return {}; }
  }
  return {};
}

function firstValue(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function getLayoutLink(order) {
  const data = dataOf(order);
  return firstValue(order.layout_link, order.design_link, order.cloud_link, data.layout_link, data.design_link, data.cloud_link, data.maked_link, data.layoutUrl, data.designUrl);
}

function getPlacePhotoLink(order) {
  const data = dataOf(order);
  return firstValue(order.place_photo_link, order.install_photo_link, data.place_photo_link, data.install_photo_link, data.placePhotoLink, data.installPhotoLink, data.photo_link, data.photos_link);
}

function getInstallPlace(order) {
  const data = dataOf(order);
  return firstValue(order.install_place, order.mount_address, order.install_address, data.install_place, data.mount_address, data.install_address, data.placement, data.location);
}

function getProductionComment(order) {
  const data = dataOf(order);
  return firstValue(order.production_comment, data.production_comment, data.technical_task, data.production_task, data.comment, order.comment);
}

function getRows(order) {
  const data = dataOf(order);
  const candidates = [order.rows, order.items, data.rows, data.items, data.order_rows, data.orderItems];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

function rowComment(row) {
  return firstValue(row.production_comment, row.technical_comment, row.comment, row.note, row.data?.comment);
}

function buildRows(rows) {
  if (!rows.length) {
    return '<tr><td colspan="4">Позиции не найдены в данных заказа. Проверьте связанный расчёт или КП.</td></tr>';
  }
  return rows.map((row, index) => {
    const qty = firstValue(row.qty, row.quantity, row.count);
    const unit = firstValue(row.unit);
    return `<tr><td>${index + 1}</td><td><b>${esc(row.name || row.title || 'Позиция')}</b></td><td>${esc(qty)} ${esc(unit)}</td><td>${esc(rowComment(row))}</td></tr>`;
  }).join('');
}

function printHtml(order) {
  const data = dataOf(order);
  const rows = getRows(order);
  const layoutLink = getLayoutLink(order);
  const placePhotoLink = getPlacePhotoLink(order);
  const installPlace = getInstallPlace(order);
  const productionComment = getProductionComment(order);
  const layoutStatus = firstValue(order.layout_status, data.layout_status, data.layoutStatus, 'Макета нет');
  const orderType = firstValue(order.order_type, data.order_type, data.orderType, '—');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Задание в производство</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#e5e7eb;color:#0f172a}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm;box-sizing:border-box}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #1d4ed8;padding-bottom:12px}.top h1{margin:0}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0}.meta div{border:1px solid #dbe3ef;border-radius:12px;padding:10px;overflow-wrap:anywhere}.meta span{display:block;color:#64748b;font-size:11px;text-transform:uppercase;font-weight:900}.meta b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th{background:#0f172a;color:#fff;text-align:left;padding:9px}td{border:1px solid #dbe3ef;padding:9px;vertical-align:top}.note{border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:12px;margin-top:14px;white-space:pre-wrap}.warn{border-color:#fde68a;background:#fffbeb}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px}.sign div{border-top:1px solid #0f172a;padding-top:6px;color:#64748b}.actions{position:fixed;right:16px;top:16px;display:flex;gap:8px}.actions button{border:0;border-radius:999px;background:#1d4ed8;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.actions .dark{background:#0f172a}@page{size:A4;margin:0}@media print{body{background:#fff}.actions{display:none}.page{margin:0}}
</style>
</head>
<body>
<div class="actions"><button onclick="window.print()">Печать / PDF</button><button class="dark" onclick="window.close()">Закрыть</button></div>
<main class="page">
  <header class="top">
    <div><h1>Задание в производство</h1><p>Внутренний документ без данных клиента</p></div>
    <div><b>№${esc(order.order_number || String(order.id || '').slice(0, 8))}</b><br>${dateRu(new Date())}</div>
  </header>

  <section class="meta">
    <div><span>Заказ</span><b>${esc(order.project_name || 'Заказ')}</b></div>
    <div><span>Тип работ</span><b>${esc(orderType)}</b></div>
    <div><span>Срок производства</span><b>${dateRu(order.deadline)}</b></div>
    <div><span>Статус макета</span><b>${esc(layoutStatus)}</b></div>
    <div><span>Место размещения / монтажа</span><b>${esc(installPlace || 'Не указано')}</b></div>
    <div><span>Ссылка на макет</span><b>${layoutLink ? `<a href="${esc(layoutLink)}">${esc(layoutLink)}</a>` : 'Не указана'}</b></div>
    <div><span>Фото места размещения</span><b>${placePhotoLink ? `<a href="${esc(placePhotoLink)}">${esc(placePhotoLink)}</a>` : 'Не указано'}</b></div>
    <div><span>Дата создания</span><b>${dateRu(order.created_at)}</b></div>
  </section>

  <h2>Состав работ</h2>
  <table><thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Производственный комментарий</th></tr></thead><tbody>${buildRows(rows)}</tbody></table>

  <div class="note"><b>Техническое задание / комментарий для производства:</b><br>${esc(productionComment || 'Не заполнено.')}</div>
  <div class="note warn"><b>Важно:</b><br>Не передавать этот лист клиенту. Документ предназначен только для производства, монтажа и внутренней передачи работ.</div>

  <section class="sign"><div>Передал в производство</div><div>Принял / выполнил</div></section>
</main>
</body>
</html>`;
}

async function loadOrder(orderId) {
  const response = await supabaseClient.from('leader_orders').select('*').eq('id', orderId).maybeSingle();
  if (response.error) throw response.error;
  if (!response.data) throw new Error('Заказ не найден');
  return response.data;
}

async function openPrivateProductionTask(orderId) {
  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) return;
  win.document.write('<p style="font-family:Arial;padding:24px">Готовлю задание в производство...</p>');
  try {
    const order = await loadOrder(orderId);
    win.document.open();
    win.document.write(printHtml(order));
    win.document.close();
  } catch (error) {
    win.document.open();
    win.document.write(`<p style="font-family:Arial;padding:24px;color:#b91c1c">Ошибка: ${esc(error.message || error)}</p>`);
    win.document.close();
  }
}

window.addEventListener('click', (event) => {
  const openOrder = event.target.closest?.('[data-open-order]');
  if (openOrder?.dataset?.openOrder) {
    currentOrderId = openOrder.dataset.openOrder;
    sessionStorage.setItem('leader_v4_current_order_id', currentOrderId);
  }

  const printButton = event.target.closest?.('[data-print-order-task]');
  if (!printButton) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const orderId = currentOrderId || sessionStorage.getItem('leader_v4_current_order_id');
  if (!orderId) {
    alert('Не удалось определить заказ. Вернитесь в список заказов и откройте заказ заново.');
    return;
  }
  openPrivateProductionTask(orderId);
}, true);
