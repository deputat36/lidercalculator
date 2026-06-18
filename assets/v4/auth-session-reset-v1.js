const SESSION_KEYS = ['leader_crm_v4_session'];

function clearKnownSessionKeys() {
  try {
    SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('CRM v4 session cleanup warning:', error);
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('#logoutBtn');
  if (!button) return;
  setTimeout(clearKnownSessionKeys, 600);
  setTimeout(clearKnownSessionKeys, 1800);
});

window.LeaderV4ClearAuthSession = clearKnownSessionKeys;
