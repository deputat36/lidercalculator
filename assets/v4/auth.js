import { V4_CONFIG } from './config.js';
import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError, isNetworkError } from './api.js';
import { setState, resetAuthState, v4State } from './state.js';
import { bindAuthUi, readCredentials, renderProfile, setAuthBusy, setProfileNotice, setStatus, showLoggedIn, showLoggedOut, toast } from './ui.js';

async function ensureProfileForUser(user) {
  if (!user?.id) return null;
  setProfileNotice('Проверяю профиль доступа...');
  try {
    const response = await timeout(
      supabaseClient.rpc('leader_ensure_profile', { user_email: user.email || '' }, {
        timeoutMs: Math.max(V4_CONFIG.timeouts.profileMs + 7000, 12000),
        timeoutMessage: 'Профиль доступа не подготовился вовремя'
      }),
      Math.max(V4_CONFIG.timeouts.profileMs + 7500, 12500),
      'Профиль доступа не подготовился вовремя'
    );
    if (response.error) throw response.error;
    const profile = response.data || null;
    if (profile && typeof profile === 'object') {
      setState({ profile, profileLoaded: true });
      renderProfile(profile);
      setProfileNotice('');
    }
    return profile;
  } catch (error) {
    console.warn('CRM v4 profile bootstrap warning:', error);
    if (!v4State.profileLoaded) {
      setProfileNotice('Профиль доступа временно не удалось подготовить. CRM откроется, но часть данных может не загрузиться.');
    }
    return null;
  }
}

async function loadProfileInBackground(user) {
  if (!user?.id) return;
  const hadProfile = Boolean(v4State.profileLoaded && v4State.profile);
  if (!hadProfile) setProfileNotice('Профиль загружается в фоне...');
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_user_profiles')
        .select('user_id,email,role,is_active,full_name')
        .eq('user_id', user.id)
        .maybeSingle(),
      Math.max(V4_CONFIG.timeouts.profileMs + 7000, 12000),
      'Профиль загружается дольше обычного'
    );
    if (response.error) throw response.error;
    if (response.data) {
      setState({ profile: response.data, profileLoaded: true });
      renderProfile(response.data);
      setProfileNotice('');
      return;
    }
    if (!hadProfile) {
      setState({ profile: null, profileLoaded: false });
      renderProfile(null);
      setProfileNotice('Профиль не найден, CRM открыта по активной сессии.');
    }
  } catch (error) {
    console.warn('CRM v4 profile warning:', error);
    if (!hadProfile) {
      setState({ profile: null, profileLoaded: false });
      renderProfile(null);
      setProfileNotice('Профиль временно не загрузился. Вход выполнен, CRM доступна.');
    } else {
      setProfileNotice('');
    }
  }
}

function emitCrmReady() {
  document.dispatchEvent(new CustomEvent('leader-v4:crm-ready', { detail: { state: v4State } }));
}

function openCrm(session, statusText = 'CRM готова') {
  setState({
    session,
    user: session.user,
    crmReady: true,
    status: statusText
  });
  showLoggedIn(session.user);
  setStatus(statusText, 'good');
  loadProfileInBackground(session.user);
  emitCrmReady();
}

export async function checkAuth() {
  setStatus('Проверяю вход', 'warn');
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) {
      resetAuthState();
      showLoggedOut();
      setStatus('Нужен вход', 'warn');
      return false;
    }
    setStatus('Проверяю профиль доступа', 'warn');
    await ensureProfileForUser(data.session.user);
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
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.user) throw new Error('Сессия не получена');
    setStatus('Подготавливаю профиль доступа', 'warn');
    await ensureProfileForUser(data.session.user);
    setStatus('Вход выполнен', 'good');
    openCrm(data.session, 'CRM готова');
    toast('Вход выполнен');
  } catch (error) {
    resetAuthState();
    showLoggedOut();
    setStatus(isNetworkError(error) ? 'Ошибка сети' : friendlyError(error), isNetworkError(error) ? 'error' : 'warn');
    toast(friendlyError(error));
  } finally {
    setState({ authBusy: false });
    setAuthBusy(false);
  }
}

export async function logout() {
  if (v4State.authBusy) return;
  setState({ authBusy: true });
  setAuthBusy(true);
  setStatus('Проверяю вход', 'warn');
  try {
    await supabaseClient.auth.signOut();
  } finally {
    resetAuthState();
    showLoggedOut();
    renderProfile(null);
    setStatus('Нужен вход', 'warn');
    setAuthBusy(false);
    toast('Вход сброшен');
  }
}

export function bootAuth() {
  bindAuthUi({ onLogin: login, onLogout: logout });
  showLoggedOut();
  checkAuth();
}

document.addEventListener('DOMContentLoaded', bootAuth);
