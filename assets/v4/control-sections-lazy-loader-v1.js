const MODULES = {
  management_dashboard: { label: 'Дашборд', file: './management-dashboard-v2.js?v=20260619-safe-1', before: 'workdesk' },
  workdesk: { label: 'Рабочий стол', file: './manager-workdesk-v1.js?v=20260619-lazy-2', before: 'leads' },
  order_control: { label: 'Контроль заказов', file: './order-control-v2.js?v=20260619-safe-2', after: 'orders' },
  finance_control: { label: 'Финансы', file: './finance-control-v2.js?v=20260619-safe-2', after: 'order_control' },
  production_control: { label: 'Контроль производства', file: './production-control-v2.js?v=20260619-safe-2', after: 'production' }
};

const loaded = new Set();
const loading = new Map();
let menuTimer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById('controlSectionsLazyLoaderV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'controlSectionsLazyLoaderV1Styles';
  style.textContent = `.v4-lazy-section{border:1px solid #dbeafe;background:#eff6ff;border-radius:18px;padding:18px}.v4-lazy-section b{display:block;margin-bottom:6px}.v4-lazy-section button{margin-top:12px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:12px;padding:9px 12px;font-weight:900}`;
  document.head.appendChild(style);
}

function nav() { return document.getElementById('v4LayoutTabs'); }
function tabButton(key) { return nav()?.querySelector(`[data-v4-tab-button="${key}"]`) || null; }

function insertButton(key, config) {
  const menu = nav();
  if (!menu || tabButton(key)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.v4TabButton = key;
  button.dataset.lazyControlTab = '1';
  button.textContent = config.label;
  const before = config.before ? tabButton(config.before) : null;
  const after = config.after ? tabButton(config.after) : null;
  if (before) before.insertAdjacentElement('beforebegin', button);
  else if (after) after.insertAdjacentElement('afterend', button);
  else menu.appendChild(button);
}

function ensureMenu() { Object.entries(MODULES).forEach(([key, config]) => insertButton(key, config)); }
function workspace() { return document.getElementById('crmWorkspace') || document.querySelector('main') || document.body; }

function ensurePlaceholder(key, text = 'Раздел загружается...') {
  ensureStyles();
  let section = document.getElementById(`${key}LazySection`);
  if (!section) {
    section = document.createElement('section');
    section.id = `${key}LazySection`;
    section.className = 'v4-card v4-managed-section';
    section.dataset.v4ManagedSection = key;
    workspace().appendChild(section);
  }
  section.innerHTML = `<div class="v4-lazy-section"><b>${esc(MODULES[key]?.label || 'Раздел')}</b><span>${esc(text)}</span><br><button type="button" data-lazy-retry="${esc(key)}">Повторить загрузку раздела</button></div>`;
  return section;
}

function showOnly(key) {
  document.body.dataset.v4Tab = key;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => button.classList.toggle('is-active', button.dataset.v4TabButton === key));
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = section.dataset.v4ManagedSection !== key; });
}

async function importWithTimeout(file, key) {
  const task = import(file);
  const timer = new Promise((_, reject) => window.setTimeout(() => reject(new Error('Модуль раздела не загрузился за 15 секунд')), 15000));
  return Promise.race([task, timer]).catch((error) => { loading.delete(key); throw error; });
}

async function loadAndOpen(key) {
  const config = MODULES[key];
  if (!config) return;
  ensureMenu();
  showOnly(key);
  if (loaded.has(key)) { window.setTimeout(() => tabButton(key)?.click(), 0); return; }
  if (loading.has(key)) return loading.get(key);
  ensurePlaceholder(key, 'Загружаю модуль раздела. Это происходит только при первом открытии вкладки.');
  showOnly(key);
  const promise = importWithTimeout(config.file, key)
    .then(() => { loaded.add(key); loading.delete(key); window.setTimeout(() => tabButton(key)?.click(), 50); })
    .catch((error) => { loading.delete(key); console.warn('[leader-v4] lazy section load error', key, error); ensurePlaceholder(key, error?.message || 'Раздел не загрузился. Попробуйте повторить.'); showOnly(key); });
  loading.set(key, promise);
  return promise;
}

function scheduleMenu() { window.clearTimeout(menuTimer); menuTimer = window.setTimeout(ensureMenu, 120); }

function bind() {
  document.addEventListener('click', (event) => {
    const retry = event.target.closest?.('[data-lazy-retry]');
    if (retry) {
      const key = retry.dataset.lazyRetry;
      loaded.delete(key); loading.delete(key);
      event.preventDefault(); event.stopImmediatePropagation(); loadAndOpen(key); return;
    }
    const button = event.target.closest?.('[data-v4-tab-button]');
    const key = button?.dataset.v4TabButton;
    if (!key || !MODULES[key]) return;
    if (loaded.has(key)) return;
    event.preventDefault(); event.stopImmediatePropagation(); loadAndOpen(key);
  }, true);
  document.addEventListener('leader-v4:crm-ready', scheduleMenu);
  document.addEventListener('leader-v4:tab-opened', scheduleMenu);
  document.addEventListener('DOMContentLoaded', scheduleMenu);
  window.setTimeout(ensureMenu, 300);
  window.setTimeout(ensureMenu, 1000);
  window.setInterval(ensureMenu, 5000);
}

bind();
