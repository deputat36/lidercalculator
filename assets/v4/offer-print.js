import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { toast, setStatus } from './ui.js';

const CALC_FIELDS = 'id,lead_id,title,client_total,public_comment';
const ITEM_FIELDS = 'id,calculation_id,name,unit,qty,client_price,client_sum,comment,sort_order';
const LEAD_FIELDS = 'id,name,phone,city,service';

function esc(value) { return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
function money(value) { const number = Number(value || 0); return `${Math.round(number).toLocaleString('ru-RU')} ₽`; }
function dateRu(value) { if (!value) return '—'; try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); } }
function publicItems(items) { return (items || []).filter((item) => Number(item.client_sum || 0) > 0); }
function plainLines(text) { return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean); }
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
  return `:root{--orange:#ff6a00;--dark:#1a1a1a;--graphite:#24282d;--muted:#7d8590;--line:#e6e8eb;--soft:#f6f7f8;--white:#fff}*{box-sizing:border-box}body{margin:0;background:#101214;color:var(--dark);font-family:Montserrat,Arial,"Helvetica Neue",sans-serif;line-height:1.45}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden;padding:0 15mm 15mm}.page:before{content:"";position:absolute;inset:0 0 auto 0;height:76mm;background:linear-gradient(135deg,rgba(255,255,255,.06) 0 10%,transparent 10% 32%,rgba(255,255,255,.045) 32% 46%,transparent 46%),linear-gradient(135deg,#111417,#1a1a1a 68%,#0d0f12);z-index:0}.page:after{content:"";position:absolute;right:-34mm;top:18mm;width:120mm;height:58mm;background:linear-gradient(135deg,transparent 0 48%,rgba(255,106,0,.95) 48% 60%,transparent 60%);transform:rotate(-7deg);opacity:.24;z-index:0}.top,.hero,.client-card,.items-card,.terms,.note,.sign,.footer{position:relative;z-index:1}.top{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start;padding-top:14mm;color:#fff}.brand{display:flex;gap:13px;align-items:center}.mark{position:relative;width:48px;height:42px;flex:0 0 48px}.mark span{position:absolute;bottom:0;display:block;background:var(--orange);transform:skewX(-17deg)}.mark .m1{left:0;width:12px;height:27px}.mark .m2{left:17px;width:14px;height:39px}.mark .m3{left:30px;width:14px;height:42px;clip-path:polygon(0 26%,100% 0,82% 100%,0 100%)}.mark .m4{right:0;bottom:0;width:16px;height:15px;background:#fff;clip-path:polygon(0 100%,55% 0,100% 100%);transform:none}.brand h1{margin:0;font-size:28px;line-height:1;text-transform:uppercase;letter-spacing:.03em;font-weight:900}.brand p{margin:6px 0 0;color:#e6e8eb;font-size:11px;letter-spacing:.42em;text-transform:lowercase}.doc-meta{text-align:right;font-size:12px;color:#e6e8eb}.doc-meta b{display:block;color:#fff;font-size:21px;margin-bottom:5px;text-transform:uppercase;letter-spacing:.02em}.hero{display:grid;grid-template-columns:1.18fr .82fr;gap:12px;margin:13mm 0 9mm}.panel{border:1px solid var(--line);border-radius:20px;padding:15px;background:#fff;box-shadow:0 12px 28px rgba(26,26,26,.08)}.panel.dark{background:rgba(255,255,255,.96)}.label{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.16em;font-weight:900;margin-bottom:5px}.big{font-size:30px;font-weight:900;color:var(--dark);line-height:1.05;text-transform:uppercase;letter-spacing:-.035em}.price{font-size:32px;font-weight:900;color:var(--orange);line-height:1}.task{font-size:13px;color:#3f454b;margin:10px 0 0}.client-card,.items-card{border:1px solid var(--line);border-radius:20px;padding:14px;background:#fff;margin-top:8mm;box-shadow:0 10px 24px rgba(26,26,26,.05)}.client-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.client-grid div{background:var(--soft);border-left:4px solid var(--orange);border-radius:13px;padding:9px 10px}.client-grid b{font-size:13px}.section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 10px}.section-title h2{font-size:16px;margin:0;text-transform:uppercase;letter-spacing:.04em}.section-title span{color:var(--muted);font-size:11px}.items{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;overflow:hidden;border-radius:14px}.items th{background:var(--dark);color:#fff;text-align:left;padding:10px;border:0;text-transform:uppercase;font-size:10px;letter-spacing:.1em}.items td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}.items tr:nth-child(even) td{background:#f7f8f9}.items .num{text-align:right;white-space:nowrap}.items .total-row td{background:#fff4ec!important;font-weight:900;font-size:14px;border-bottom:0}.items .total-row td:last-child{color:var(--orange);font-size:18px}.terms{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:8mm}.term{border:1px solid var(--line);border-radius:16px;padding:12px;background:#fff}.term b{display:block;margin-bottom:4px;color:var(--dark)}.term span{color:var(--muted);font-size:12px}.note{margin-top:7mm;padding:13px;border-radius:16px;background:#1a1a1a;border:1px solid #2d3339;color:#fff;font-size:12px}.note b{color:var(--orange)}.sign{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:14mm}.sign div{border-top:1px solid var(--dark);padding-top:5px;color:var(--muted);font-size:12px}.footer{position:absolute;left:15mm;right:15mm;bottom:8mm;border-top:1px solid var(--line);padding-top:6px;color:var(--muted);font-size:10px;display:flex;justify-content:space-between;gap:12px}.footer b{color:var(--dark)}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:5}.print-actions button{border:0;border-radius:999px;background:var(--orange);color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions button.secondary{background:var(--dark)}@page{size:A4;margin:0}@media print{body{background:#fff}.page{margin:0;box-shadow:none}.print-actions{display:none}.footer{position:absolute}}`;
}
function itemRows(items) {
  const visible = publicItems(items);
  if (!visible.length) return '<tr><td colspan="5">Работы по согласованной заявке</td></tr>';
  return visible.map((item, index) => {
    const qty = Number(item.qty || 0);
    const unit = item.unit || 'шт';
    return `<tr><td class="num">${index + 1}</td><td><b>${esc(item.name || 'Позиция')}</b>${item.comment ? `<br><span>${esc(item.comment)}</span>` : ''}</td><td class="num">${qty ? qty.toLocaleString('ru-RU') : '—'} ${esc(unit)}</td><td class="num">${money(item.client_price || 0)}</td><td class="num"><b>${money(item.client_sum || 0)}</b></td></tr>`;
  }).join('');
}
function buildPrintHtml({ offer, calculation, items, lead }) {
  const today = new Date().toLocaleDateString('ru-RU');
  const total = Number(offer.total_sum || calculation?.client_total || 0);
  const task = taskText(lead, calculation, offer);
  const publicComment = calculation?.public_comment || '';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(offer.title || 'Коммерческое предложение')}</title><style>${printStyles()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / сохранить PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page"><header class="top"><div class="brand"><div class="mark"><span class="m1"></span><span class="m2"></span><span class="m3"></span><span class="m4"></span></div><div><h1>ЛИДЕР</h1><p>рекламное агентство</p></div></div><div class="doc-meta"><b>Коммерческое предложение</b><div>Дата: ${esc(today)}</div><div>Действует до: ${esc(dateRu(offer.valid_until))}</div><div>№ ${esc(String(offer.id || '').slice(0, 8).toUpperCase())}</div></div></header><section class="hero"><div class="panel dark"><span class="label">Предложение</span><div class="big">${esc(offer.title || calculation?.title || 'Работы по заявке')}</div><p class="task">${esc(task)}</p></div><div class="panel"><span class="label">Итоговая стоимость</span><div class="price">${money(total)}</div><p class="task">Стоимость указана для согласованного состава работ.</p></div></section><section class="client-card"><div class="section-title"><h2>Клиент</h2><span>данные заявки</span></div><div class="client-grid"><div><span class="label">Имя</span><b>${esc(lead?.name || 'Не указано')}</b></div><div><span class="label">Телефон</span><b>${esc(lead?.phone || 'Не указано')}</b></div><div><span class="label">Город</span><b>${esc(lead?.city || 'Борисоглебск')}</b></div><div><span class="label">Услуга</span><b>${esc(lead?.service || calculation?.title || 'Рекламные работы')}</b></div></div></section><section class="items-card"><div class="section-title"><h2>Состав предложения</h2><span>цены для клиента</span></div><table class="items"><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${itemRows(items)}<tr class="total-row"><td colspan="4">Итого к оплате</td><td class="num">${money(total)}</td></tr></tbody></table></section><section class="terms"><div class="term"><b>Запуск в работу</b><span>После подтверждения состава, стоимости и внесения предоплаты.</span></div><div class="term"><b>Макет</b><span>Производство запускается после согласования финального макета.</span></div><div class="term"><b>Сроки</b><span>Срок зависит от готовности макета, материалов и загрузки производства.</span></div><div class="term"><b>Доставка / монтаж</b><span>Условия доставки и монтажа согласуются отдельно, если они не включены в состав.</span></div></section>${publicComment ? `<div class="note"><b>Примечание:</b> ${esc(publicComment)}</div>` : '<div class="note"><b>Важно:</b> предложение действительно при сохранении указанных параметров заказа, материалов и объёма работ.</div>'}<section class="sign"><div>Представитель РА «Лидер»</div><div>Клиент / согласовано</div></section><footer class="footer"><span><b>ЛИДЕР</b> · рекламное агентство</span><span>Коммерческое предложение сформировано в CRM</span></footer></main></body></html>`;
}

async function loadPrintBundle(offer) {
  let calculation = null;
  let items = [];
  let lead = v4State.currentLead || null;
  if (offer.calculation_id) {
    const calcResponse = await timeout(supabaseClient.from('leader_lead_calculations').select(CALC_FIELDS).eq('id', offer.calculation_id).maybeSingle(), 12000, 'Расчёт для печати не загрузился за 12 секунд');
    if (calcResponse.error) throw calcResponse.error;
    calculation = calcResponse.data || null;
    const itemsResponse = await timeout(supabaseClient.from('leader_lead_calculation_items').select(ITEM_FIELDS).eq('calculation_id', offer.calculation_id).order('sort_order', { ascending: true }).limit(160), 12000, 'Позиции КП для печати не загрузились за 12 секунд');
    if (itemsResponse.error) throw itemsResponse.error;
    items = itemsResponse.data || [];
  }
  if ((!lead || lead.id !== offer.lead_id) && offer.lead_id) {
    const leadResponse = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', offer.lead_id).maybeSingle(), 12000, 'Заявка для печати не загрузилась за 12 секунд');
    if (leadResponse.error) throw leadResponse.error;
    lead = leadResponse.data || lead;
  }
  return { offer, calculation, items, lead };
}

async function openPrintOffer(offerId) {
  const offer = (v4State.offers || []).find((item) => item.id === offerId);
  if (!offer) { toast('КП не найдено'); return; }
  const printWindow = window.open('', '_blank', 'width=980,height=900');
  if (!printWindow) { toast('Браузер заблокировал окно печати'); return; }
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
