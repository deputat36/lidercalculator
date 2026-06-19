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

const warmedTabs = new Set();
let sheetPrintAutoTouched = false;
let productionBoardLoading = null;

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

function loadProductionBoardV3() {
  if (productionBoardLoading) return productionBoardLoading;
  productionBoardLoading = import('./production-board-v3.js?v=20260619-production-light-4')
    .then((module) => {
      if (document.body.dataset.v4Tab === 'production' && typeof module.loadProductionBoard === 'function') {
        return module.loadProductionBoard(false);
      }
      return null;
    })
    .catch((error) => {
      productionBoardLoading = null;
      const box = document.getElementById('productionBoardSectionContent');
      if (box) box.innerHTML = `<div class="v4-empty is-error">Ошибка подключения производства: ${String(error?.message || error)}</div>`;
    });
  return productionBoardLoading;
}

function dispatchTabOpened(tab) {
  if (tab === 'production') loadProductionBoardV3();
  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab } }));
}

function shouldWarmProduction() {
  if (warmedTabs.has('production')) return false;
  const content = document.getElementById('productionBoardSectionContent');
  if (!content) return true;
  const text = content.textContent || '';
  return text.includes('Раздел производства загружается') || text.includes('Загружаю') || text.trim() === '';
}

function warmProductionOnce() {
  if (!shouldWarmProduction()) return;
  warmedTabs.add('production');
  loadProductionBoardV3();
}

function openProductionTab() {
  showOnly('production');
  warmProductionOnce();
  dispatchTabOpened('production');
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

// Важно: обычные вкладки ведёт responsive-ui-v2.js.
// Этот модуль перехватывает только «Производство», чтобы не было двойного управления вкладками и падений загрузки разделов.
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-v4-tab-button="production"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  openProductionTab();
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
  if (event.detail?.tab === 'production') openProductionTab();
});

window.LeaderV4LoadProductionBoard = loadProductionBoardV3;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ensureManagedSections();
    if (document.body.dataset.v4Tab === 'production') dispatchTabOpened('production');
    scheduleSheetEnhance();
  });
} else {
  ensureManagedSections();
  if (document.body.dataset.v4Tab === 'production') dispatchTabOpened('production');
  scheduleSheetEnhance();
}
