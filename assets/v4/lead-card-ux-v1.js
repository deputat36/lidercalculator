function text(selector) {
  return document.querySelector(selector)?.textContent?.trim() || '';
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}
function ensureStyles() {
  if (document.getElementById('leadCardUxV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'leadCardUxV1Styles';
  style.textContent = `
    .v4-lead-card-view{display:grid;gap:16px;max-width:100%;overflow:hidden}
    .v4-card-view-head{background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;border-radius:22px;padding:18px;box-shadow:0 18px 44px rgba(15,23,42,.18)}
    .v4-card-view-head .v4-kicker,.v4-card-view-head p{color:#dbeafe!important}.v4-card-view-head h2{color:#fff!important;margin-bottom:6px}
    .v4-card-view-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.v4-card-view-actions>*{min-height:42px}
    .v4-lead-ux-summary{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:10px}.v4-lead-ux-card{border:1px solid #dbeafe;background:#fff;border-radius:18px;padding:13px;min-width:0;box-shadow:0 8px 24px rgba(15,23,42,.05)}.v4-lead-ux-card span{display:block;color:#64748b;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}.v4-lead-ux-card b{display:block;color:#0f172a;font-size:17px;line-height:1.2;word-break:break-word}.v4-lead-ux-card.is-main{background:#fff7ed;border-color:#fed7aa}.v4-lead-ux-card.is-main b{color:#c2410c}
    .v4-action-panel{border:2px solid #bfdbfe!important;background:#eff6ff!important}.v4-action-panel h3{margin-bottom:6px}.v4-action-panel p{font-size:16px;line-height:1.45}.v4-quick-actions{display:flex!important;gap:8px!important;flex-wrap:wrap!important}.v4-chip-button{border-radius:999px!important;padding:9px 12px!important}.v4-chip-button.is-active{background:#2563eb!important;color:#fff!important;border-color:#2563eb!important}.v4-chip-button.is-danger{background:#fff1f2!important;color:#991b1b!important;border-color:#fecdd3!important}.v4-next-contact-box{background:#fff;border:1px solid #bfdbfe;border-radius:18px;padding:12px;margin-top:12px}.v4-next-contact-row{display:grid!important;grid-template-columns:minmax(220px,1.2fr) repeat(5,minmax(110px,.7fr));gap:8px;align-items:end}.v4-next-contact-row button{min-height:42px}
    .v4-workflow-guide{position:sticky;top:74px;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(10px);border:1px solid #e2e8f0;border-radius:18px;padding:10px;box-shadow:0 12px 34px rgba(15,23,42,.08)}.v4-workflow-guide>div{min-width:0}.v4-workflow-guide b{flex:0 0 auto}
    .v4-lead-section-title{display:flex;align-items:center;gap:10px;margin:4px 0 -6px}.v4-lead-section-title b{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#ff6a00;color:#fff}.v4-lead-section-title h3{margin:0;font-size:18px;text-transform:uppercase}.v4-lead-section-title p{margin:2px 0 0;color:#64748b;font-size:13px}
    .v4-detail-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important}.v4-detail-grid>div{min-width:0}.v4-subcard,.v4-calculations-host,.v4-offers-host{border-radius:20px!important}.v4-needs-section{border-color:#fed7aa!important}.v4-calculations-host{border:1px solid #bbf7d0!important;background:#f0fdf4!important;padding:14px!important}.v4-offers-host{border:1px solid #c7d2fe!important;background:#eef2ff!important;padding:14px!important}
    @media(max-width:1180px){.v4-lead-ux-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.v4-next-contact-row{grid-template-columns:repeat(3,minmax(0,1fr))}.v4-card-view-head{display:grid!important;grid-template-columns:1fr!important}.v4-card-view-actions{justify-content:flex-start}}
    @media(max-width:680px){.v4-lead-ux-summary,.v4-next-contact-row{grid-template-columns:1fr}.v4-workflow-guide{position:static}.v4-card-view-actions{display:grid}.v4-card-view-actions>*{width:100%}}
  `;
  document.head.appendChild(style);
}
function detailValue(label) {
  const rows = [...document.querySelectorAll('#leadCardContent .v4-detail-grid div')];
  const found = rows.find((row) => row.querySelector('dt')?.textContent?.trim() === label);
  return found?.querySelector('dd')?.textContent?.trim() || '—';
}
function ensureSummary() {
  const card = document.querySelector('#leadCardContent .v4-lead-card-view');
  const head = card?.querySelector('.v4-card-view-head');
  if (!card || !head || card.querySelector('.v4-lead-ux-summary')) return;
  const name = text('#leadCardContent .v4-card-view-head h2') || 'Без имени';
  const service = text('#leadCardContent .v4-card-view-head p') || 'Услуга не указана';
  const status = detailValue('Статус');
  const phone = detailValue('Телефон');
  const next = detailValue('Следующий контакт');
  head.insertAdjacentHTML('afterend', `<section class="v4-lead-ux-summary" aria-label="Кратко по заявке"><div class="v4-lead-ux-card is-main"><span>Клиент и задача</span><b>${esc(name)} · ${esc(service)}</b></div><div class="v4-lead-ux-card"><span>Статус</span><b>${esc(status)}</b></div><div class="v4-lead-ux-card"><span>Телефон</span><b>${esc(phone)}</b></div><div class="v4-lead-ux-card"><span>Следующий контакт</span><b>${esc(next)}</b></div></section>`);
}
function labelSection(selector, number, title, subtitle) {
  const node = document.querySelector(selector);
  if (!node || node.previousElementSibling?.classList?.contains('v4-lead-section-title')) return;
  node.insertAdjacentHTML('beforebegin', `<div class="v4-lead-section-title"><b>${number}</b><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div></div>`);
}
function simplifyTech() {
  const sections = [...document.querySelectorAll('#leadCardContent .v4-subcard')];
  const tech = sections.find((section) => section.textContent.includes('Технические данные формы'));
  if (tech && !tech.dataset.collapsed) {
    tech.dataset.collapsed = '1';
    const html = tech.innerHTML;
    tech.innerHTML = `<details><summary>Технические данные формы</summary><div style="margin-top:12px">${html.replace(/<h3>Технические данные формы<\/h3>/, '')}</div></details>`;
  }
}
function run() {
  ensureStyles();
  ensureSummary();
  labelSection('.v4-action-panel', '1', 'Контакт и статус', 'Сначала связываемся с клиентом и фиксируем следующий шаг.');
  labelSection('.v4-needs-section', '2', 'Потребности', 'Размеры, материалы, сроки, дизайн, монтаж и особые условия.');
  labelSection('#calculationsBox', '3', 'Расчёты', 'Сохраняем варианты, проверяем маржу и выбираем подходящий.');
  labelSection('#offersBox', '4', 'Коммерческие предложения', 'Формируем КП, отправляем клиенту и согласовываем.');
  simplifyTech();
}

document.addEventListener('leader-v4:lead-card-rendered', () => { setTimeout(run, 80); setTimeout(run, 500); });
document.addEventListener('leader-v4:route-change', () => setTimeout(run, 250));
document.addEventListener('DOMContentLoaded', run);
setInterval(run, 1800);
