function bootSiteCacheNote() {
  if (document.getElementById('siteCacheNoteV1')) return;
  const note = document.createElement('div');
  note.id = 'siteCacheNoteV1';
  note.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;max-width:330px;background:#0f172a;color:#fff;border-radius:16px;padding:12px 14px;font:13px/1.4 Arial,sans-serif;box-shadow:0 16px 44px rgba(15,23,42,.24);display:none';
  note.innerHTML = '<b style="display:block;margin-bottom:4px">Подсказка проверки</b>Если на сайте или в CRM виден старый вид, нажмите Ctrl + F5. Это обновит кеш CSS/JS.';
  document.body.appendChild(note);
  const key = 'leader-cache-note-seen-20260621';
  if (!localStorage.getItem(key)) {
    note.style.display = 'block';
    localStorage.setItem(key, '1');
    setTimeout(() => { note.style.display = 'none'; }, 9000);
  }
  import('./crm-ui-selfcheck-v1.js?v=20260623-2').catch(() => {});
  import('./public-lead-audit-v1.js?v=20260623-1').catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSiteCacheNote); else bootSiteCacheNote();