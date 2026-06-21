import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { toast, setStatus } from './ui.js';

const CALC_FIELDS = 'id,lead_id,title,client_total,public_comment';
const ITEM_FIELDS = 'id,calculation_id,name,unit,qty,client_price,client_sum,comment,sort_order';
const LEAD_FIELDS = 'id,name,phone,city,service';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('ru-RU')} ₽`;
const dateRu = (v) => { if (!v) return '—'; try { return new Date(v).toLocaleDateString('ru-RU'); } catch (_) { return String(v); } };
const visibleItems = (items) => (items || []).filter((item) => Number(item.client_sum || 0) > 0);

function css() {
  return `:root{--o:#ff6a00;--d:#1a1a1a;--m:#6b7280;--l:#e5e7eb;--s:#f7f8fa}*{box-sizing:border-box}body{margin:0;background:#111827;color:var(--d);font-family:Arial,Helvetica,sans-serif}.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;position:relative;overflow:hidden;padding:0 14mm 15mm}.page:before{content:"";position:absolute;left:0;right:0;top:0;height:76mm;background:linear-gradient(135deg,#0d0f12,#1a1a1a 72%,#101214);z-index:0}.page:after{content:"";position:absolute;right:-32mm;top:20mm;width:112mm;height:55mm;background:linear-gradient(135deg,transparent 0 47%,rgba(255,106,0,.95) 47% 60%,transparent 60%);transform:rotate(-7deg);opacity:.28;z-index:0}.top,.hero,.card,.items-wrap,.terms,.note,.sign,.foot{position:relative;z-index:1}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding-top:14mm;color:#fff}.logo{display:flex;align-items:center;gap:12px;min-width:190px;background:#fff;color:#1a1a1a;border-radius:18px;padding:11px 14px;box-shadow:0 14px 32px rgba(0,0,0,.22)}.logo-mark{position:relative;display:block;width:44px;height:40px;flex:0 0 44px}.logo-mark i{position:absolute;bottom:0;display:block;background:var(--o);transform:skewX(-17deg)}.logo-mark i:nth-child(1){left:0;width:11px;height:25px}.logo-mark i:nth-child(2){left:16px;width:13px;height:36px}.logo-mark i:nth-child(3){left:29px;width:13px;height:40px;clip-path:polygon(0 28%,100% 0,84% 100%,0 100%)}.logo-text strong{display:block;font-size:24px;line-height:1;font-weight:900;text-transform:uppercase;letter-spacing:.02em}.logo-text small{display:block;margin-top:4px;color:#7d8590;font-size:10px;text-transform:lowercase;letter-spacing:.18em}.meta{text-align:right;color:#e5e7eb;font-size:12px}.meta b{display:block;color:#fff;font-size:20px;text-transform:uppercase}.hero{display:grid;grid-template-columns:1.12fr .88fr;gap:12px;margin:13mm 0 8mm}.panel,.card{border:1px solid var(--l);border-radius:20px;background:#fff;padding:14px;box-shadow:0 10px 25px rgba(26,26,26,.07)}.label{display:block;color:var(--m);font-size:10px;text-transform:uppercase;letter-spacing:.14em;font-weight:900;margin-bottom:5px}.big{font-size:30px;font-weight:900;text-transform:uppercase;line-height:1.05;letter-spacing:-.03em}.price{font-size:32px;color:var(--o);font-weight:900;line-height:1}.task{font-size:13px;color:#374151;margin:10px 0 0;line-height:1.45}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{background:var(--s);border-left:4px solid var(--o);border-radius:13px;padding:9px 10px}.items-wrap{margin-top:8mm}.title{display:flex;justify-content:space-between;align-items:center;margin:0 0 10px}.title h2{margin:0;font-size:16px;text-transform:uppercase}.title span{color:var(--m);font-size:11px}.items{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border-radius:14px;overflow:hidden}.items th{background:var(--d);color:#fff;text-align:left;padding:10px;text-transform:uppercase;font-size:10px;letter-spacing:.1em}.items td{padding:10px;border-bottom:1px solid var(--l);vertical-align:top}.items tr:nth-child(even) td{background:#f7f8f9}.num{text-align:right;white-space:nowrap}.total-row td{background:#fff4ec!important;font-weight:900}.total-row td:last-child{color:var(--o);font-size:18px}.terms{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:8mm}.term{border:1px solid var(--l);border-radius:16px;padding:12px;background:#fff}.term b{display:block}.term span{color:var(--m);font-size:12px}.note{margin-top:7mm;padding:13px;border-radius:16px;background:#1a1a1a;color:#fff;font-size:12px}.note b{color:var(--o)}.sign{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:14mm}.sign div{border-top:1px solid var(--d);padding-top:5px;color:var(--m);font-size:12px}.foot{position:absolute;left:14mm;right:14mm;bottom:7mm;border-top:1px solid var(--l);padding-top:6px;color:var(--m);font-size:10px;display:flex;justify-content:space-between}.foot b{color:var(--d)}.presentation{padding:0 13mm 13mm}.presentation:before{height:112mm}.presentation .cover{position:relative;z-index:1;color:#fff;min-height:112mm;margin:0 -13mm 9mm;padding:14mm 13mm}.presentation .top{padding-top:0}.presentation .hero{display:block;margin:18mm 0 0;max-width:132mm}.presentation .big{font-size:38px;color:#fff}.presentation .task{color:#e6e8eb;max-width:112mm}.presentation .price-box{position:absolute;right:13mm;bottom:13mm;width:68mm;background:#fff;color:#1a1a1a;border-radius:22px;padding:14px}.presentation .price-box b{display:block;color:var(--o);font-size:31px}.presentation .after-cover{position:relative;z-index:1}.presentation .dark{background:#1a1a1a;color:#fff;border-color:#2d3339}.presentation .dark .label{color:#e6e8eb}.print-actions{position:fixed;right:16px;top:16px;display:flex;gap:8px;z-index:5}.print-actions button{border:0;border-radius:999px;background:var(--o);color:#fff;padding:10px 14px;font-weight:900;cursor:pointer}.print-actions button.secondary{background:var(--d)}@page{size:A4;margin:0}@media print{body{background:#fff}.page{margin:0}.print-actions{display:none}}`;
}

function logoHtml() {
  return '<div class="logo"><span class="logo-mark"><i></i><i></i><i></i></span><span class="logo-text"><strong>Лидер</strong><small>рекламное агентство</small></span></div>';
}
function top(offer, title = 'Коммерческое предложение') {
  return `<header class="top">${logoHtml()}<div class="meta"><b>${title}</b><div>${dateRu(new Date())}</div><div>до ${dateRu(offer.valid_until)}</div></div></header>`;
}
function taskText(lead, calc, offer) {
  return [lead?.service, calc?.title].filter(Boolean).join('. ') || offer.title || 'Работы по согласованной заявке';
}
function rows(items) {
  const rows = visibleItems(items);
  if (!rows.length) return '<tr><td colspan="5">Работы по согласованной заявке</td></tr>';
  return rows.map((item, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(item.name || 'Позиция')}</b>${item.comment ? `<br><span>${esc(item.comment)}</span>` : ''}</td><td class="num">${Number(item.qty || 0).toLocaleString('ru-RU')} ${esc(item.unit || 'шт')}</td><td class="num">${money(item.client_price)}</td><td class="num"><b>${money(item.client_sum)}</b></td></tr>`).join('');
}
function table(items, total) {
  return `<section class="items-wrap"><div class="title"><h2>Состав предложения</h2><span>цены для клиента</span></div><table class="items"><thead><tr><th>№</th><th>Наименование</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>${rows(items)}<tr class="total-row"><td colspan="4">Итого</td><td class="num">${money(total)}</td></tr></tbody></table></section>`;
}
function business(bundle) {
  const { offer, calculation, items, lead } = bundle;
  const total = Number(offer.total_sum || calculation?.client_total || 0);
  const comment = calculation?.public_comment || 'Предложение действительно при сохранении указанных параметров заказа, материалов и объёма работ.';
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(offer.title || 'КП')}</title><style>${css()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page">${top(offer)}<section class="hero"><div class="panel"><span class="label">Предложение</span><div class="big">${esc(offer.title || calculation?.title || 'Работы по заявке')}</div><p class="task">${esc(taskText(lead, calculation, offer))}</p></div><div class="panel"><span class="label">Итоговая стоимость</span><div class="price">${money(total)}</div><p class="task">Стоимость указана для согласованного состава работ.</p></div></section><section class="card"><div class="title"><h2>Клиент</h2><span>данные заявки</span></div><div class="grid"><div class="field"><span class="label">Имя</span><b>${esc(lead?.name || 'Не указано')}</b></div><div class="field"><span class="label">Телефон</span><b>${esc(lead?.phone || 'Не указано')}</b></div><div class="field"><span class="label">Город</span><b>${esc(lead?.city || 'Борисоглебск')}</b></div><div class="field"><span class="label">Услуга</span><b>${esc(lead?.service || calculation?.title || 'Рекламные работы')}</b></div></div></section>${table(items, total)}<section class="terms"><div class="term"><b>Запуск в работу</b><span>После подтверждения состава, стоимости и предоплаты.</span></div><div class="term"><b>Макет</b><span>Производство запускается после согласования финального макета.</span></div><div class="term"><b>Сроки</b><span>Зависят от макета, материалов и загрузки производства.</span></div><div class="term"><b>Доставка / монтаж</b><span>Согласуются отдельно, если не включены в состав.</span></div></section><div class="note"><b>Важно:</b> ${esc(comment)}</div><section class="sign"><div>Представитель РА «Лидер»</div><div>Клиент / согласовано</div></section><footer class="foot"><span><b>ЛИДЕР</b> · рекламное агентство</span><span>КП сформировано в CRM</span></footer></main></body></html>`;
}
function presentation(bundle) {
  const { offer, calculation, items, lead } = bundle;
  const total = Number(offer.total_sum || calculation?.client_total || 0);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(offer.title || 'КП')}</title><style>${css()}</style></head><body><div class="print-actions"><button onclick="window.print()">Печать / PDF</button><button class="secondary" onclick="window.close()">Закрыть</button></div><main class="page presentation"><section class="cover">${top(offer, 'КП')}<section class="hero"><span class="label" style="color:#ff6a00">идеи, которые ведут вперёд</span><div class="big">${esc(offer.title || calculation?.title || 'Рекламные работы')}</div><p class="task">${esc(taskText(lead, calculation, offer))}</p></section><div class="price-box"><span class="label">Итоговая стоимость</span><b>${money(total)}</b><p>Цена для согласованного состава работ.</p></div></section><div class="after-cover"><section class="grid"><div class="card"><h3>Клиент</h3><div class="field"><span class="label">Имя</span><b>${esc(lead?.name || 'Не указано')}</b></div><div class="field"><span class="label">Телефон</span><b>${esc(lead?.phone || 'Не указано')}</b></div></div><div class="card dark"><h3>Как запускаем</h3><p>1. Подтверждаем состав и стоимость.</p><p>2. Согласовываем макет и материалы.</p><p>3. Запускаем производство после предоплаты.</p></div></section>${table(items, total)}<div class="note"><b>Важно:</b> ${esc(calculation?.public_comment || 'Предложение действительно при сохранении указанных параметров заказа, материалов и объёма работ.')}</div></div><footer class="foot"><span><b>ЛИДЕР</b> · рекламное агентство</span><span>Коммерческое предложение</span></footer></main></body></html>`;
}
async function loadBundle(offer) {
  let calculation = null, items = [], lead = v4State.currentLead || null;
  if (offer.calculation_id) {
    const calc = await timeout(supabaseClient.from('leader_lead_calculations').select(CALC_FIELDS).eq('id', offer.calculation_id).maybeSingle(), 12000, 'Расчёт для печати не загрузился за 12 секунд');
    if (calc.error) throw calc.error;
    calculation = calc.data || null;
    const rowsRes = await timeout(supabaseClient.from('leader_lead_calculation_items').select(ITEM_FIELDS).eq('calculation_id', offer.calculation_id).order('sort_order', { ascending: true }).limit(160), 12000, 'Позиции КП для печати не загрузились за 12 секунд');
    if (rowsRes.error) throw rowsRes.error;
    items = rowsRes.data || [];
  }
  const leadId = offer.lead_id || calculation?.lead_id || lead?.id;
  if (leadId && (!lead || lead.id !== leadId)) {
    const leadRes = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle(), 12000, 'Заявка для печати не загрузилась за 12 секунд');
    if (leadRes.error) throw leadRes.error;
    lead = leadRes.data || lead;
  }
  return { offer, calculation, items, lead };
}
async function openPrintOffer(offerId, template = 'business') {
  const offer = (v4State.offers || []).find((item) => item.id === offerId);
  if (!offer) { toast('КП не найдено'); return; }
  const win = window.open('', '_blank', 'width=980,height=900');
  if (!win) { toast('Браузер заблокировал окно печати'); return; }
  win.document.write('<p style="font-family:Arial;padding:24px">Готовлю печатное КП...</p>');
  try {
    setStatus('Готовлю печатное КП...', 'warn');
    const bundle = await loadBundle(offer);
    win.document.open();
    win.document.write(template === 'presentation' ? presentation(bundle) : business(bundle));
    win.document.close();
    setStatus('Печатное КП открыто', 'good');
  } catch (error) {
    win.document.open();
    win.document.write(`<p style="font-family:Arial;padding:24px;color:#b91c1c">Ошибка подготовки КП: ${esc(friendlyError(error))}</p>`);
    win.document.close();
    setStatus(`Ошибка печатного КП: ${friendlyError(error)}`, 'error');
  }
}
function addButtons() {
  document.querySelectorAll('.v4-offer-card').forEach((card) => {
    const actions = card.querySelector('.v4-offer-actions');
    if (!actions || actions.querySelector('[data-print-offer-template]')) return;
    actions.insertAdjacentHTML('afterbegin', '<button type="button" data-print-offer-template="business">PDF строгий</button><button type="button" data-print-offer-template="presentation">PDF презентация</button>');
  });
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-print-offer-template],[data-print-offer]');
  if (!button) return;
  const offerId = button.closest('.v4-offer-card')?.dataset.id;
  const template = button.dataset.printOfferTemplate || 'business';
  if (offerId) openPrintOffer(offerId, template);
});
document.addEventListener('leader-v4:lead-card-rendered', addButtons);
setInterval(addButtons, 1500);
