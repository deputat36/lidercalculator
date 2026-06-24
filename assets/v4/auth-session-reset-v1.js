const CRM_SESSION_KEY = 'leader_crm_v4_test_session';
const LEGACY_SHARED_SESSION_KEY = 'leader_crm_v4_session';

function removeSessionKey(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('CRM v4 session cleanup warning:', error);
  }
}

function clearCrmSessionKeys() {
  removeSessionKey(CRM_SESSION_KEY);
  removeSessionKey(LEGACY_SHARED_SESSION_KEY);
}

function bootSessionIsolation() {
  removeSessionKey(LEGACY_SHARED_SESSION_KEY);
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#logoutBtn');
  if (!button) return;
  setTimeout(clearCrmSessionKeys, 600);
  setTimeout(clearCrmSessionKeys, 1800);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootSessionIsolation, { once: true });
} else {
  bootSessionIsolation();
}

window.LeaderV4ClearAuthSession = clearCrmSessionKeys;
