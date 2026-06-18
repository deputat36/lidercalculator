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

function scheduleClean() {
  setTimeout(cleanProfileNotice, 300);
  setTimeout(cleanProfileNotice, 1200);
  setTimeout(cleanProfileNotice, 3000);
}

document.addEventListener('leader-v4:crm-ready', scheduleClean);
document.addEventListener('DOMContentLoaded', scheduleClean);

document.addEventListener('input', (event) => {
  if (event.target?.id === 'loginEmail' || event.target?.id === 'loginPassword') cleanProfileNotice();
});
