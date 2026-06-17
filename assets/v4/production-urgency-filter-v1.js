let booted = false;
let currentMode = 'all';

function ensureStyles() {
  if (document.getElementById('productionUrgencyFilterV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionUrgencyFilterV1Styles';
  style.textContent = `
    .v4-production-urgency{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:10px;margin:-2px 0 0}.v4-production-urgency span{font-weight:900;color:#475569}.v4-production-urgency button{background:#f8fafc}.v4-production-urgency button.is-active{background:#0f172a;color:#fff;border-color:#0f172a}.v4-production-urgency button.is-danger.is-active{background:#dc2626;border-color:#dc2626}.v4-production-urgency button.is-warn.is-active{background:#d97706;border-color:#d97706}.v4-production-card.is-hidden-by-urgency{display:none!important}.v4-production-column.is-empty-by-urgency .v4-production-empty-filter{display:block}.v4-production-empty-filter{display:none;border:1px dashed #cbd5e1;border-radius:14px;padding:12px;background:#fff;color:#475569;font-weight:800;margin-top:8px}
  `;
  document.head.appendChild(style);
}

function parseCardDate(card) {
  const text = card.textContent || '';
  const match = text.match(/(?:Срок|Монтаж):\s*(\d{2})\.(\d{2})\.(\d{4})(?:,?\s*(\d{1,2}):(\d{2}))?/i);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = '23', min = '59'] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isOverdue(card) {
  if (card.classList.contains('is-overdue')) return true;
  const date = parseCardDate(card);
  if (!date) return false;
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime() < Date.now() && !/готово|выполнен|закрыт|принят/i.test(card.textContent || '');
}

function shouldShow(card) {
  if (currentMode === 'all') return true;
  if (currentMode === 'overdue') return isOverdue(card);
  if (currentMode === 'today') return isToday(parseCardDate(card)) && !isOverdue(card);
  return true;
}

function ensureControls() {
  const board = document.querySelector('#productionBoardSectionContent .v4-production-board');
  if (!board) return null;
  let controls = board.querySelector('#productionUrgencyFilter');
  if (!controls) {
    controls = document.createElement('div');
    controls.id = 'productionUrgencyFilter';
    controls.className = 'v4-production-urgency';
    controls.innerHTML = `<span>Быстрый фильтр:</span><button type="button" data-production-urgency="all">Все</button><button type="button" class="is-danger" data-production-urgency="overdue">Просрочено</button><button type="button" class="is-warn" data-production-urgency="today">Сегодня</button>`;
    const filters = board.querySelector('.v4-production-board-filters');
    if (filters) filters.insertAdjacentElement('afterend', controls);
    else board.insertAdjacentElement('afterbegin', controls);
  }
  controls.querySelectorAll('[data-production-urgency]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.productionUrgency === currentMode);
  });
  return controls;
}

function ensureColumnEmpty(column) {
  let empty = column.querySelector('.v4-production-empty-filter');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'v4-production-empty-filter';
    empty.textContent = 'По быстрому фильтру задач нет.';
    column.appendChild(empty);
  }
  return empty;
}

function applyFilter() {
  ensureStyles();
  const controls = ensureControls();
  if (!controls) return;
  document.querySelectorAll('#productionBoardSectionContent .v4-production-column').forEach((column) => {
    let visibleCount = 0;
    column.querySelectorAll('.v4-production-card').forEach((card) => {
      const show = shouldShow(card);
      card.classList.toggle('is-hidden-by-urgency', !show);
      if (show) visibleCount += 1;
    });
    ensureColumnEmpty(column);
    column.classList.toggle('is-empty-by-urgency', visibleCount === 0 && currentMode !== 'all');
  });
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-production-urgency]');
    if (!button) return;
    event.preventDefault();
    currentMode = button.dataset.productionUrgency || 'all';
    applyFilter();
  });
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'production') setTimeout(applyFilter, 700);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-list-refresh="production"],[data-production-board-kind],[data-board-production-status],[data-board-install-status]')) {
      setTimeout(applyFilter, 900);
    }
  });
  new MutationObserver(() => applyFilter()).observe(document.body, { childList: true, subtree: true });
  setTimeout(applyFilter, 1000);
}

boot();
