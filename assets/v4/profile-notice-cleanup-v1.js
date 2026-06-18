function cleanProfileNotice() {
  const notice = document.getElementById('profileNotice');
  if (!notice) return;
  const role = (document.getElementById('profileRole')?.textContent || '').trim();
  const active = (document.getElementById('profileActive')?.textContent || '').trim();
  const text = (notice.textContent || '').trim();
  const profileLooksLoaded = role && role !== '—' && active && active !== '—';
  const isTemporaryWarning = text.includes('Профиль временно не загрузился') || text.includes('Профиль загружается дольше обычного');
  if (profileLooksLoaded && isTemporaryWarning) {
    notice.textContent = '';
    notice.classList.add('hidden');
  }
}

document.addEventListener('leader-v4:crm-ready', () => {
  setTimeout(cleanProfileNotice, 300);
  setTimeout(cleanProfileNotice, 1200);
  setTimeout(cleanProfileNotice, 3000);
});
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(cleanProfileNotice, 1200);
  setTimeout(cleanProfileNotice, 3000);
});
new MutationObserver(() => cleanProfileNotice()).observe(document.body, { childList: true, subtree: true, characterData: true });
