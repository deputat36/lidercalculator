const SECTION_BY_TAB = {
  leads: 'leadsSection',
  orders: 'ordersListSection',
  production: 'productionBoardSection',
  clients: 'clientsSection',
  calculations: 'calculationsListSection',
  offers: 'offersListSection',
  catalog: 'catalogSection',
  settings: 'settingsSection',
  card: 'leadCardSection',
  orderCard: 'orderCardSection'
};

const LIST_TABS = ['orders', 'production', 'clients', 'calculations', 'offers'];
const warmedTabs = new Set();
let sheetPrintAutoTouched = false;

function ensureManagedSections() {
  Object.entries(SECTION_BY_TAB).forEach(([tab, id]) => {
    const el = document.getElementById(id);
    if (el) el.dataset.v4ManagedSection = tab;
  });
  document.querySelectorAll('.v4-next-card').forEach((el) => {
    el.dataset.v4ManagedSection = 'help';
  });
}

function markActive(tab) {
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.v4TabButton === tab);
  });
}

function showOnly(tab) {
  ensureManagedSections();
  document.body.dataset.v4Tab = tab;
  markActive(tab);
  document.querySelectorAll('[data-v4-managed-section]').forEach((section) => {
    section.hidden = section.dataset.v4ManagedSection !== tab;
  });
  const targetId = SECTION_BY_TAB[tab];
  const target = targetId ? document.getElementById(targetId) : null;
  if (target) {
    target.hidden = false;
    target.style.display = '';
  }
}

function shouldWarmTab(tab) {
  if (!LIST_TABS.includes(tab)) return false;
  if (warmedTabs.has(tab)) return false;
  const content = document.getElementById(`${SECTION_BY_TAB[tab]}Content`);
  if (!content) return true;
  const text = content.textContent || '';
  return text.includes('Раздел загружается') || text.includes('Загружаю') || text.trim() === '';
}

function warmTabOnce(tab) {
  if (!shouldWarmTab(tab)) return;
  warmedTabs.add(tab);
  const button = document.querySelector(`[data-v4-list-refresh="${tab}"]`);
  if (button) button.click();
}

function openTab(tab) {
  if (!tab) return;
  showOnly(tab);
  warmTabOnce(tab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function enhanceSheetPrintOption() {
  const box = document.getElementById('standardCalculationsBox');
  if (!box) return;
  const mode = document.getElementById('stdMode')?.value;
  const print = document.getElementById('stdSheetPrint');
  const lamination = document.getElementById('stdSheetLamination');
  const preview = document.getElementById('stdCalcPreview');
  if (mode !== 'sheet' || !print || !preview) return;

  if (!sheetPrintAutoTouched) {
    print.checked = true;
    if (lamination) lamination.checked = true;
    sheetPrintAutoTouched = true;
    print.dispatchEvent(new Event('change', { bubbles: true }));
  }

  let notice = document.getElementById('stdSheetPrintNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'stdSheetPrintNotice';
    notice.style.cssText = 'margin:10px 0;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;padding:10px 12px;font-weight:900;line-height:1.45';
    preview.insertAdjacentElement('beforebegin', notice);
  }
  notice.innerHTML = '✓ Печать на плёнке такого же размера включена. При добавлении позиции CRM создаст отдельную строку плёнки по тем же ширине, высоте и количеству. Накатку можно оставить включённой или снять галочку ниже.';

  const label = print.closest('label');
  if (label) {
    label.style.background = '#dcfce7';
    label.style.borderColor = '#86efac';
    label.style.color = '#166534';
  }
}

function scheduleSheetEnhance() {
  setTimeout(enhanceSheetPrintOption, 60);
  setTimeout(enhanceSheetPrintOption, 250);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-v4-tab-button]');
  if (!button) return;
  const tab = button.dataset.v4TabButton || 'leads';
  if (!SECTION_BY_TAB[tab] && tab !== 'help') return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openTab(tab);
}, true);

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-std-mode="sheet"]')) {
    sheetPrintAutoTouched = false;
    scheduleSheetEnhance();
  }
});

document.addEventListener('change', (event) => {
  if (event.target?.id === 'stdMode' || event.target?.id === 'stdSheetPrint') scheduleSheetEnhance();
});

document.addEventListener('leader-v4:lead-card-rendered', scheduleSheetEnhance);
document.addEventListener('leader-v4:route-change', () => {
  sheetPrintAutoTouched = false;
  scheduleSheetEnhance();
});

window.addEventListener('leader-v4:force-tab', (event) => {
  openTab(event.detail?.tab || 'leads');
});

window.leaderV4OpenTab = openTab;
window.v4SetTab = openTab;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    showOnly(document.body.dataset.v4Tab || 'leads');
    scheduleSheetEnhance();
  });
} else {
  showOnly(document.body.dataset.v4Tab || 'leads');
  scheduleSheetEnhance();
}
