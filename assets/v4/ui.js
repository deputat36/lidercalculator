const STATUS_CLASS = {
  good: 'is-good',
  warn: 'is-warn',
  error: 'is-error'
};

export function byId(id) {
  return document.getElementById(id);
}

export function setStatus(text, tone = 'warn') {
  const element = byId('authStatus');
  if (!element) return;
  element.textContent = text;
  element.className = `v4-status ${STATUS_CLASS[tone] || STATUS_CLASS.warn}`;
}

export function setAuthBusy(isBusy) {
  const loginButton = byId('loginBtn');
  const logoutButton = byId('logoutBtn');
  if (loginButton) {
    loginButton.disabled = isBusy;
    loginButton.textContent = isBusy ? 'Вхожу...' : 'Войти';
  }
  if (logoutButton) logoutButton.disabled = isBusy;
}

export function showLoggedOut() {
  byId('loginForm')?.classList.remove('hidden');
  byId('userPanel')?.classList.add('hidden');
  byId('crmWorkspace')?.classList.add('hidden');
  setProfileNotice('');
}

export function showLoggedIn(user) {
  byId('loginForm')?.classList.add('hidden');
  byId('userPanel')?.classList.remove('hidden');
  byId('crmWorkspace')?.classList.remove('hidden');
  const email = user?.email || 'пользователь';
  const userEmail = byId('userEmail');
  const profileEmail = byId('profileEmail');
  if (userEmail) userEmail.textContent = email;
  if (profileEmail) profileEmail.textContent = email;
}

export function renderProfile(profile) {
  const profileName = byId('profileName');
  const profileRole = byId('profileRole');
  const profileActive = byId('profileActive');
  if (profileName) profileName.textContent = profile?.full_name || '—';
  if (profileRole) profileRole.textContent = profile?.role || '—';
  if (profileActive) profileActive.textContent = profile ? (profile.is_active === false ? 'Отключён' : 'Активен') : '—';
}

export function setProfileNotice(text) {
  const element = byId('profileNotice');
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('hidden', !text);
}

export function toast(text) {
  const element = byId('toast');
  if (!element) return;
  element.textContent = text;
  element.classList.add('show');
  window.setTimeout(() => element.classList.remove('show'), 2600);
}

export function readCredentials() {
  return {
    email: byId('loginEmail')?.value.trim() || '',
    password: byId('loginPassword')?.value || ''
  };
}

export function bindAuthUi({ onLogin, onLogout }) {
  byId('loginForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    onLogin();
  });
  byId('logoutBtn')?.addEventListener('click', () => onLogout());
}
