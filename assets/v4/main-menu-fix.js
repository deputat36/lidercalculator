const SECTION_BY_TAB = {
  leads: 'leadsSection',
  orders: 'ordersListSection',
  clients: 'clientsSection',
  calculations: 'calculationsListSection',
  offers: 'offersListSection',
  catalog: 'catalogSection',
  settings: 'settingsSection',
  card: 'leadCardSection',
  orderCard: 'orderCardSection'
};

const LIST_TABS = ['orders', 'clients', 'calculations', 'offers'];
const warmedTabs = new Set();

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

window.addEventListener('leader-v4:force-tab', (event) => {
  openTab(event.detail?.tab || 'leads');
});

window.leaderV4OpenTab = openTab;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => showOnly(document.body.dataset.v4Tab || 'leads'));
} else {
  showOnly(document.body.dataset.v4Tab || 'leads');
}
