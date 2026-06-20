import './production-diagnostics-v1.js?v=20260620-limit-1';

let booted = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById('orderProductionCardLinksV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'orderProductionCardLinksV1Styles';
  style.textContent = `
    .v4-production-actions .v4-job-open-btn{background:#ecfdf5;border-color:#86efac;color:#166534;font-weight:900}.v4-production-actions .v4-install-open-btn{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8;font-weight:900}
  `;
  document.head.appendChild(style);
}

function addProductionButtons() {
  document.querySelectorAll('#orderProductionControlBox [data-production-job-status]').forEach((statusButton) => {
    const actions = statusButton.closest('.v4-production-actions');
    const jobId = statusButton.dataset.productionJobStatus;
    if (!actions || !jobId || actions.querySelector(`[data-open-production-job-card="${CSS.escape(jobId)}"]`)) return;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" class="v4-job-open-btn" data-open-production-job-card="${esc(jobId)}">Карточка</button><button type="button" class="v4-job-open-btn" data-print-production-job="${esc(jobId)}">Печать</button>`);
  });
}

function addInstallationButtons() {
  document.querySelectorAll('#orderProductionControlBox [data-install-job-status]').forEach((statusButton) => {
    const actions = statusButton.closest('.v4-production-actions');
    const jobId = statusButton.dataset.installJobStatus;
    if (!actions || !jobId || actions.querySelector(`[data-open-installation-job-card="${CSS.escape(jobId)}"]`)) return;
    actions.insertAdjacentHTML('afterbegin', `<button type="button" class="v4-install-open-btn" data-open-installation-job-card="${esc(jobId)}">Карточка</button><button type="button" class="v4-install-open-btn" data-print-installation-job="${esc(jobId)}">Печать</button>`);
  });
}

function enhance() {
  ensureStyles();
  addProductionButtons();
  addInstallationButtons();
}

function boot() {
  if (booted) return;
  booted = true;
  ensureStyles();
  document.addEventListener('leader-v4-order-updated', () => setTimeout(enhance, 600));
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'orderCard' || event.detail?.tab === 'production') setTimeout(enhance, 700);
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-open-order],[data-production-refresh],[data-create-production-job],[data-create-production-job-safe],[data-create-installation-from-order],[data-upsert-installation-from-order],[data-create-extra-installation-from-order],[data-production-job-status],[data-install-job-status],[data-save-production-job],[data-save-installation-job]')) {
      setTimeout(enhance, 900);
      setTimeout(enhance, 1600);
    }
  });
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
  setTimeout(enhance, 1000);
}

boot();
