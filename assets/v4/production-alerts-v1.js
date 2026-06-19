import { supabaseClient } from './supabase-client.js';

let loading = false;
let lastRun = 0;

const DONE_PRODUCTION = ['готово', 'готов к выдаче', 'выдано', 'закрыт', 'отменено'];
const DONE_INSTALLATION = ['выполнен', 'принят', 'закрыт', 'отменён', 'отменено'];

function ensureStyles() {
  if (document.getElementById('productionAlertsV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionAlertsV1Styles';
  style.textContent = `
    .v4-production-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:6px;padding:0 6px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:900;line-height:1}.v4-production-tab-badge.is-warn{background:#fef3c7;color:#92400e}.v4-production-tab-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-production-alert-line{border:1px solid #fecaca;background:#fff7f7;color:#991b1b;border-radius:14px;padding:10px 12px;margin:0 0 12px;font-weight:900}.v4-production-alert-line.is-ok{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.v4-production-alert-line.is-warn{border-color:#fde68a;background:#fffbeb;color:#92400e}
  `;
  document.head.appendChild(style);
}

function isDone(status, dictionary) {
  const text = String(status || '').toLowerCase();
  return dictionary.some((word) => text.includes(word));
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isOverdue(value, done) {
  if (done) return false;
  const date = dateOnly(value);
  if (!date) return false;
  date.setHours(23, 59, 59, 999);
  return date.getTime() < Date.now();
}

function isToday(value, done) {
  if (done) return false;
  const date = dateOnly(value);
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function badge() {
  const button = document.querySelector('[data-v4-tab-button="production"]');
  if (!button) return null;
  let b = button.querySelector('.v4-production-tab-badge');
  if (!b) {
    b = document.createElement('span');
    b.className = 'v4-production-tab-badge';
    b.textContent = '•';
    b.title = 'Проверка производства запускается при открытии раздела';
    button.appendChild(b);
  }
  return b;
}

function setBadge(counts) {
  const b = badge();
  if (!b) return;
  const totalProblem = counts.overdueProduction + counts.overdueInstallation;
  const totalToday = counts.todayProduction + counts.todayInstallation;
  b.classList.remove('is-warn', 'is-danger');
  if (totalProblem > 0) {
    b.textContent = String(totalProblem);
    b.title = `Просрочено: производство ${counts.overdueProduction}, монтаж ${counts.overdueInstallation}`;
    b.classList.add('is-danger');
    return;
  }
  if (totalToday > 0) {
    b.textContent = String(totalToday);
    b.title = `На сегодня: производство ${counts.todayProduction}, монтаж ${counts.todayInstallation}`;
    b.classList.add('is-warn');
    return;
  }
  b.textContent = '✓';
  b.title = 'Просроченных задач нет';
}

function insertAlertLine(counts) {
  const box = document.getElementById('productionBoardSectionContent');
  if (!box) return;
  const board = box.querySelector('.v4-production-board');
  if (!board) return;
  let line = box.querySelector('#productionAlertLine');
  if (!line) {
    line = document.createElement('div');
    line.id = 'productionAlertLine';
    board.insertAdjacentElement('afterbegin', line);
  }
  const totalProblem = counts.overdueProduction + counts.overdueInstallation;
  const totalToday = counts.todayProduction + counts.todayInstallation;
  line.className = 'v4-production-alert-line';
  if (totalProblem > 0) {
    line.textContent = `Внимание: просрочено задач — ${totalProblem}. Производство: ${counts.overdueProduction}, монтаж: ${counts.overdueInstallation}.`;
    return;
  }
  if (totalToday > 0) {
    line.classList.add('is-warn');
    line.textContent = `Сегодня требуют внимания задач — ${totalToday}. Производство: ${counts.todayProduction}, монтаж: ${counts.todayInstallation}.`;
    return;
  }
  line.classList.add('is-ok');
  line.textContent = 'Просроченных производственных и монтажных задач нет.';
}

async function fetchCounts() {
  const [productionResponse, installationResponse] = await Promise.all([
    supabaseClient.from('leader_production_jobs').select('id,production_status,deadline').order('deadline', { ascending: true }).limit(80),
    supabaseClient.from('leader_installation_jobs').select('id,install_status,scheduled_at').order('scheduled_at', { ascending: true }).limit(80)
  ]);
  const production = productionResponse.error ? [] : productionResponse.data || [];
  const installation = installationResponse.error ? [] : installationResponse.data || [];
  const counts = { overdueProduction: 0, overdueInstallation: 0, todayProduction: 0, todayInstallation: 0 };
  production.forEach((job) => {
    const done = isDone(job.production_status, DONE_PRODUCTION);
    if (isOverdue(job.deadline, done)) counts.overdueProduction += 1;
    else if (isToday(job.deadline, done)) counts.todayProduction += 1;
  });
  installation.forEach((job) => {
    const done = isDone(job.install_status, DONE_INSTALLATION);
    if (isOverdue(job.scheduled_at, done)) counts.overdueInstallation += 1;
    else if (isToday(job.scheduled_at, done)) counts.todayInstallation += 1;
  });
  return counts;
}

async function refreshProductionAlerts(force = false) {
  ensureStyles();
  const now = Date.now();
  if (!force && now - lastRun < 20000) return;
  if (loading) return;
  loading = true;
  try {
    const counts = await fetchCounts();
    lastRun = now;
    setBadge(counts);
    insertAlertLine(counts);
  } finally {
    loading = false;
  }
}

function boot() {
  ensureStyles();
  badge();
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
  document.addEventListener('leader-v4-order-updated', () => {
    if (document.body.dataset.v4Tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-v4-list-refresh="production"],[data-board-production-status],[data-board-install-status],[data-create-installation-from-order]')) return;
    if (document.body.dataset.v4Tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
}

if (!window.LeaderV4ProductionAlertsV1Booted) {
  window.LeaderV4ProductionAlertsV1Booted = true;
  boot();
}

export { refreshProductionAlerts };