function roleText() {
  return (document.getElementById('profileRole')?.textContent || '').trim().toLowerCase();
}

function mayEditPrices() {
  const role = roleText();
  return role === 'admin' || role === 'owner';
}

function applyCatalogViewMode() {
  const section = document.getElementById('catalogSection');
  if (!section) return;
  const canEdit = mayEditPrices();
  let notice = document.getElementById('catalogViewModeNotice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'catalogViewModeNotice';
    notice.className = 'v4-empty';
    notice.style.margin = '0 0 12px';
    notice.textContent = 'Режим просмотра: изменение цен и номенклатуры доступно только владельцу или администратору.';
  }
  notice.hidden = canEdit;
  const head = section.querySelector('.v4-section-head');
  if (!notice.parentNode) {
    if (head) head.insertAdjacentElement('afterend', notice);
    else section.prepend(notice);
  }
  if (canEdit) return;
  section.querySelectorAll('[data-catalog-save], #createCatalogItemBtn').forEach((button) => {
    button.style.display = 'none';
  });
  section.querySelectorAll('.v4-catalog-create').forEach((box) => {
    box.style.display = 'none';
  });
  section.querySelectorAll('input[id^="cat_"], select[id^="cat_"]').forEach((field) => {
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('disabled', 'disabled');
  });
}

document.addEventListener('leader-v4:crm-ready', () => {
  setTimeout(applyCatalogViewMode, 500);
  setTimeout(applyCatalogViewMode, 1500);
});
document.addEventListener('leader-v4:tab-opened', (event) => {
  if (event.detail?.tab === 'catalog') {
    setTimeout(applyCatalogViewMode, 400);
    setTimeout(applyCatalogViewMode, 1600);
  }
});
document.addEventListener('click', (event) => {
  if (event.target.closest?.('#reloadCatalogBtn, [data-v4-tab-button="catalog"]')) {
    setTimeout(applyCatalogViewMode, 900);
    setTimeout(applyCatalogViewMode, 1800);
  }
});
