import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { toast, setStatus } from './ui.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  const number = Number(value || 0);
  return `${Math.round(number).toLocaleString('ru-RU')} ₽`;
}

function dateRu(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU');
  } catch (_) {
    return String(value);
  }
}

function publicItems(items) {
  return (items || []).filter((item) => Number(item.client_sum || 0) > 0);
}

function plainLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function taskText(lead, calculation, offer) {
  const lines = [];
  if (lead?.service) lines.push(lead.service);
  if (calculation?.title) lines.push(calculation.title);
  const full = plainLines(offer.full_text || '');
  const index = full.findIndex((line) => line.toLowerCase().includes('задача клиента'));
  if (index >= 0 && full[index + 1]) lines.push(full[index + 1]);
  return [...new Set(lines)].slice(0, 3).join('. ') || 'Работы по согласованной заявке';
}

function addPrintButtons() {
  document.querySelectorAll('.v4-offer-card').forEach((card) => {
    const actions = card.querySelector('.v4-offer-actions');
    if (!actions || actions.querySelector('[data-print-offer]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.printOffer = '1';
    button.textContent = 'Печать / PDF';
    actions.insertBefore(button, actions.firstChild);
  });
}

function printStyles() {
  return `
    :root{--blue:#1d4ed8;--dark:#0f172a;--muted:#64748b;--line:#dbe3ef;--soft:#f8fafc;--green:#15803d;}
    *{box-sizing:border-box}
    body{margin:0;background:#e5e7eb;color:var(--dark);font-family:Arial,"Helvetica Neue",sans-serif;line-height:1.45}
    .page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:16mm 15mm 14mm;position:relative;overflow:hidden}
    .page:before{content:"";position:absolute;inset:0 0 auto 0;height:9mm;background:linear-gradient(90deg,#0f172a,#1d4ed8,#38bdf8)}
    .top{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start;margin-top:9mm;padding-bottom:10mm;border-bottom:2px solid var(--line)}
    .brand{display:flex;gap:12px;align-items:center}
    .logo{width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,#1d4ed8,#38bdf8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:22px;letter-spacing:-1px}
    .brand h1{margin:0;font-size:25px;line-height:1.05;letter-spacing:-.4px}.brand p{margin:4px 0 0;color:var(--muted);font-size:12px}
    .doc-meta{text-align:right;font-size:12px;color:var(--muted)}.doc-meta b{display:block;color:var(--dark);font-size:18px;margin-bottom:4px}
    .hero{display:grid;grid-template-columns:1.25fr .75fr;gap:12px;margin:10mm 0}.panel{border:1px solid var(--line);border-radius:18px;padding:14px;background:#fff}.panel.soft{background:linear-gradient(135deg,#eff6ff,#fff)}
    .label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:900;margin-bottom:4px}.big{font-size:30px;font-weight:900;color:var(--blue);line-height:1.05}.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.client-grid div{border-top:1px dashed var(--line);padding-top:8px}
    h2{font-size:16px;margin:0 0 9px}.task{font-size:14px}.items{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}.items th{background:#0f172a;color:#fff;text-align:left;padding:9px;border:1px solid #0f172a}.items td{padding:9px;border:1px solid var(--line);vertical-align:top}.items tr:nth-child(even) td{background:#f8fafc}.items .num{text-align:right;white-space:nowrap}.items .total-row td{background:#eff6ff!important;font-weight:900;font-size:14px}.terms{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10mm}.term{border:1px solid var(--line);border-radius:16px;padding:12px;background:#fff}.term b{display:block;margin-bottom:4px}.term span{color:var(--muted);font-size:12px}.note{margin-top:8mm;padding:12px;border-radius:16px;background:#f0fdf4;border:1px solid #bbf7d0;color:#14532d;font-size:12px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:15mm}.sign div{border-top:1px solid var(--dark);padding-top:5px;color:var(--muted);font-size:12px}.footer{position:absolute;left:15mm;right:15mm;bottom:8mm;border-top:1px solid var(--line);padding-top:5px;color:var(--muted);font-size:10px;display:flex;justify-content:space-between;gap:12px}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:5}.print-actions button{border:0;border-radius:999px;background:#1d4ed8;color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions button.secondary{background:#0f172a}
    @page{size:A4;margin:0}
    @media print{body{background:#fff}.page{margin:0;box-shadow:none}.print-actions{display:none}.footer{position:absolute}}
  `;
}

function itemRows(items) {
  const visible = publicItems(items);
  if (!visible.length) {
    return '<tr><td colspan="5">Работы по согласованной заявке</td></tr>';
  }
  return visible.map((item, index) => {
    const qty = Number(item.qty || 0);
    const unit = item.unit || 'шт';
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td><b>${esc(item.name || 'Позиция')}</b>${item.comment ? `<br><span>${esc(item.comment)}</span>` : ''}</td>
        <td class="num">${qty ? qty.toLocaleString('ru-RU') : '—'} ${esc(unit)}</td>
        <td class="num">${money(item.client_price || 0)}</td>
        <td class="num"><b>${money(item.client_sum || 0)}</b></td>
      </tr>
    `;
  }).join('');
}

function buildPrintHtml({ offer, calculation, items, lead }) {
  const today = new Date().toLocaleDateString('ru-RU');
  const total = Number(offer.total_sum || calculation?.client_total || 0);
  const task = taskText(lead, calculation, offer);
  const publicComment = calculation?.public_comment || '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(offer.title || 'Коммерческое предложение')}</title>
<style>${printStyles()}</style>
</head>
<body>
<div class="print-actions"><button onclick="window.print()">Печать / сохранить PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div>
<main class="page">
  <header class="top">
    <div class="brand">
      <div class="logo">Л</div>
      <div>
        <h1>РА «Лидер»</h1>
        <p>Рекламное производство · Борисоглебск</p>
      </div>
    </div>
    <div class="doc-meta">
      <b>Коммерческое предложение</b>
      <div>Дата: ${esc(today)}</div>
      <div>Действует до: ${esc(dateRu(offer.valid_until))}</div>
      <div>№ ${esc(String(offer.id || '').slice(0, 8).toUpperCase())}</div>
    </div>
  </header>

  <section class="hero">
    <div class="panel soft">
      <span class="label">Предложение</span>
      <div class="big">${esc(offer.title || calculation?.title || 'Работы по заявке')}</div>
      <p class="task">${esc(task)}</p>
    </div>
    <div class="panel">
      <span class="label">Итоговая стоимость</span>
      <div class="big">${money(total)}</div>
      <p>Стоимость указана для согласованного состава работ.</p>
    </div>
  </section>

  <section class="panel">
    <h2>Клиент</h2>
    <div class="client-grid">
      <div><span class="label">Имя</span><b>${esc(lead?.name || 'Не указано')}</b></div>
      <div><span class="label">Телефон</span><b>${esc(lead?.phone || 'Не указано')}</b></div>
      <div><span class="label">Город</span><b>${esc(lead?.city || 'Борисоглебск')}</b></div>
      <div><span class="label">Услуга</span><b>${esc(lead?.service || calculation?.title || 'Рекламные работы')}</b></div>
    </div>
  </section>

  <section class="panel" style="margin-top:8mm">
    <h2>Состав предложения</h2>
    <table class="items">
      <thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
      <tbody>
        ${itemRows(items)}
        <tr class="total-row"><td colspan="4">Итого к оплате</td><td class="num">${money(total)}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="terms">
    <div class="term"><b>Запуск в работу</b><span>После подтверждения состава, стоимости и внесения предоплаты.</span></div>
    <div class="term"><b>Макет</b><span>Производство запускается после согласования финального макета.</span></div>
    <div class="term"><b>Сроки</b><span>Срок зависит от готовности макета, материалов и загрузки производства.</span></div>
    <div class="term"><b>Доставка / монтаж</b><span>Условия доставки и монтажа согласуются отдельно, если они не включены в состав.</span></div>
  </section>

  ${publicComment ? `<div class="note"><b>Примечание:</b> ${esc(publicComment)}</div>` : '<div class="note"><b>Важно:</b> предложение действительно при сохранении указанных параметров заказа, материалов и объёма работ.</div>'}

  <section class="sign">
    <div>Представитель РА «Лидер»</div>
    <div>Клиент / согласовано</div>
  </section>

  <footer class="footer">
    <span>РА «Лидер» · рекламное производство</span>
    <span>Коммерческое предложение сформировано в CRM</span>
  </footer>
</main>
</body>
</html>`;
}

async function loadPrintBundle(offer) {
  let calculation = null;
  let items = [];
  let lead = v4State.currentLead || null;

  if (offer.calculation_id) {
    const calcResponse = await timeout(
      supabaseClient.from('leader_lead_calculations').select('*').eq('id', offer.calculation_id).maybeSingle(),
      12000,
      'Расчёт для печати не загрузился за 12 секунд'
    );
    if (calcResponse.error) throw calcResponse.error;
    calculation = calcResponse.data || null;

    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select('*')
        .eq('calculation_id', offer.calculation_id)
        .order('sort_order', { ascending: true }),
      12000,
      'Позиции КП для печати не загрузились за 12 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;
    items = itemsResponse.data || [];
  }

  if ((!lead || lead.id !== offer.lead_id) && offer.lead_id) {
    const leadResponse = await timeout(
      supabaseClient.from('leader_leads').select('*').eq('id', offer.lead_id).maybeSingle(),
      12000,
      'Заявка для печати не загрузилась за 12 секунд'
    );
    if (leadResponse.error) throw leadResponse.error;
    lead = leadResponse.data || lead;
  }

  return { offer, calculation, items, lead };
}

async function openPrintOffer(offerId) {
  const offer = (v4State.offers || []).find((item) => item.id === offerId);
  if (!offer) {
    toast('КП не найдено');
    return;
  }
  const printWindow = window.open('', '_blank', 'width=980,height=900');
  if (!printWindow) {
    toast('Браузер заблокировал окно печати');
    return;
  }
  printWindow.document.write('<p style="font-family:Arial;padding:24px">Готовлю печатное КП...</p>');
  try {
    setStatus('Готовлю печатное КП...', 'warn');
    const bundle = await loadPrintBundle(offer);
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(bundle));
    printWindow.document.close();
    setStatus('Печатное КП открыто', 'good');
  } catch (error) {
    printWindow.document.open();
    printWindow.document.write(`<p style="font-family:Arial;padding:24px;color:#b91c1c">Ошибка подготовки КП: ${esc(friendlyError(error))}</p>`);
    printWindow.document.close();
    setStatus(`Ошибка печатного КП: ${friendlyError(error)}`, 'error');
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-print-offer]');
  if (!button) return;
  const card = button.closest('.v4-offer-card');
  const offerId = card?.dataset.id;
  if (offerId) openPrintOffer(offerId);
});

document.addEventListener('leader-v4:lead-card-rendered', addPrintButtons);
setInterval(addPrintButtons, 1500);
