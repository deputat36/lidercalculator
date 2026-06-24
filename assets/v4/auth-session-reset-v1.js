const CRM_SESSION_KEY = 'leader_crm_v4_session';

function clearCrmSessionKey() {
  try {
    localStorage.removeItem(CRM_SESSION_KEY);
  } catch (error) {
    console.warn('CRM v4 session cleanup warning:', error);
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#logoutBtn');
  if (!button) return;
  setTimeout(clearCrmSessionKey, 600);
  setTimeout(clearCrmSessionKey, 1800);
});

window.LeaderV4ClearAuthSession = clearCrmSessionKey;
