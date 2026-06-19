import { V4_CONFIG } from './config.js';
import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError, isNetworkError } from './api.js';
import { setState, resetAuthState, v4State } from './state.js';
import { bindAuthUi, readCredentials, renderProfile, setAuthBusy, setProfileNotice, setStatus, showLoggedIn, showLoggedOut, toast } from './ui.js';

async function loadProfileInBackground(user) {
  if (!user?.id) return;
  const hadProfile = Boolean(v4State.profileLoaded && v4State.profile);
  if (!hadProfile) setProfileNotice('Профиль доступа загружается в фоне. CRM уже открыта.');
  try {
    const response = await supabaseClient
      .from('leader_user_profiles')
      .select('user_id,email,role,is_active,full_name')
      .eq('user_id', user.id)
      .maybeSingle();
    if (response.error) throw response.error;
    if (response.data) {
      setState({ profile: response.data, profileLoaded: true });
      renderProfile(response.data);
      setProfileNotice('');
      return;
    }

    const ensured = await supabaseClient.rpc('leader_ensure_profile', { user_email: user.email || '' }, {
      timeoutMs: Math.max(V4_CONFIG.timeouts.profileMs + 7000, 12000),
      timeoutMessage: 'Профиль доступа не подготовился вовремя'
    });
    if (ensured.error) throw ensured.error;
    if (ensured.data && typeof ensured.data === 'object') {
      setState({ profile: ensured.data, profileLoaded: true });
      renderProfile(ensured.data);
      setProfileNotice('');
      return;
    }

    if (!hadProfile) {
      setState({ profile: null, profileLoaded: false });
      renderProfile(null);
      setProfileNotice('Профиль доступа пока не найден. CRM открыта, данные можно загружать вручную.');
    }
  } catch (error) {
    console.warn('CRM v4 profile warning:', error);
    if (!hadProfile) {
      setState({ profile: null, profileLoaded: false });
      renderProfile(null);
      setProfileNotice('');
    }
  }
}

function emitCrmReady() {
  document.dispatchEvent(new CustomEvent('leader-v4:crm-ready', { detail: { state: v4State } }));
}

function openCrm(session, statusText = 'CRM готова') {
  if (!session?.user) return;
  setState({
    session,
    user: session.user,
    crmReady: true,
    status: statusText
  });
  showLoggedIn(session.user);
  setStatus(statusText, 'good');
  emitCrmReady();
  window.setTimeout(() => loadProfileInBackground(session.user), 400);
}

export async function checkAuth() {
  setStatus('Проверяю вход', 'warn');
  try {
    const { data, error } = await timeout(
      supabaseClient.auth.getSession(),
      12000,
      'Проверка сессии не ответила вовремя'
    );
    if (error) throw error;
    if (!data.session?.user) {
      resetAuthState();
      showLoggedOut();
      setStatus('Нужен вход', 'warn');
      return false;
    }
    openCrm(data.session, 'CRM готова');
    return true;
  } catch (error) {
    resetAuthState();
    showLoggedOut();
    setStatus(isNetworkError(error) ? 'Ошибка сети' : 'Нужен вход', isNetworkError(error) ? 'error' : 'warn');
    return false;
  }
}

export async function login() {
  if (v4State.authBusy) return;
  const { email, password } = readCredentials();
  if (!email || !password) {
    setStatus('Нужен вход', 'warn');
    toast('Введите email и пароль');
    return;
  }
  setState({ authBusy: true });
  setAuthBusy(true);
  setStatus('Проверяю вход', 'warn');
  try {
    const { data, error } = await timeout(
      supabaseClient.auth.signInWithPassword({ email, password }),
      22000,
      'Вход не ответил за 22 секунды. Проверьте интернет и повторите.'
    );
    if (error) throw error;
    if (!data.session?.user) throw new Error('Сессия не получена');
    openCrm(data.session, 'Вход выполнен. CRM открыта');
    toast('Вход выполнен');
  } catch (error) {
    resetAuthState();
    showLoggedOut();
    const message = isNetworkError(error) ? 'Ошибка сети или долгий ответ Supabase. Повторите вход.' : friendlyError(error);
    setStatus(message, isNetworkError(error) ? 'error' : 'warn');
    toast(message);
  } finally {
    setState({ authBusy: false });
    setAuthBusy(false);
  }
}

export async function logout() {
  if (v4State.authBusy) return;
  setState({ authBusy: true });
  setAuthBusy(true);
  setStatus('Выход из CRM...', 'warn');
  try {
    await timeout(supabaseClient.auth.signOut(), 12000, 'Выход не ответил вовремя');
  } finally {
    resetAuthState();
    showLoggedOut();
    renderProfile(null);
    setProfileNotice('');
    setStatus('Нужен вход', 'warn');
    setAuthBusy(false);
    setState({ authBusy: false });
    toast('Вход сброшен');
  }
}

export function bootAuth() {
  bindAuthUi({ onLogin: login, onLogout: logout });
  showLoggedOut();
  checkAuth();
}

document.addEventListener('DOMContentLoaded', bootAuth);
