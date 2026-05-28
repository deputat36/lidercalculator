import { V4_CONFIG } from './config.js';
import { fetchJson, timeout } from './api.js';

const baseHeaders = Object.freeze({
  apikey: V4_CONFIG.supabasePublishableKey,
  'Content-Type': 'application/json'
});

function storage() {
  return window.localStorage;
}

function normalizeSession(data) {
  if (!data) return null;
  const expiresAt = data.expires_at || (data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : null);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    token_type: data.token_type || 'bearer',
    user: data.user || null
  };
}

function saveSession(session) {
  if (!session?.access_token) return;
  storage().setItem(V4_CONFIG.authStorageKey, JSON.stringify(session));
}

function readSession() {
  try {
    const raw = storage().getItem(V4_CONFIG.authStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearSession() {
  storage().removeItem(V4_CONFIG.authStorageKey);
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  const { data } = await fetchJson(
    `${V4_CONFIG.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    { method: 'POST', headers: baseHeaders, body: JSON.stringify({ refresh_token: session.refresh_token }) },
    V4_CONFIG.timeouts.sessionMs,
    'Проверка входа не ответила вовремя'
  );
  const refreshed = normalizeSession(data);
  saveSession(refreshed);
  return refreshed;
}

async function currentSession() {
  const session = readSession();
  if (!session?.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - now < 60) {
    return refreshSession(session).catch(() => {
      clearSession();
      return null;
    });
  }
  return session;
}

async function authHeaders() {
  const session = await currentSession();
  return session?.access_token
    ? { ...baseHeaders, Authorization: `Bearer ${session.access_token}` }
    : { ...baseHeaders };
}

function encode(value) {
  return encodeURIComponent(value);
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.columns = '*';
    this.filters = [];
    this.singleMode = false;
  }

  select(columns = '*') {
    this.columns = columns;
    return this;
  }

  eq(column, value) {
    this.filters.push(`${encode(column)}=eq.${encode(value)}`);
    return this;
  }

  maybeSingle() {
    this.singleMode = true;
    return this;
  }

  url() {
    const query = [`select=${encode(this.columns)}`, ...this.filters].join('&');
    return `${V4_CONFIG.supabaseUrl}/rest/v1/${this.table}?${query}`;
  }

  async execute() {
    try {
      const headers = await authHeaders();
      if (this.singleMode) headers.Accept = 'application/vnd.pgrst.object+json';
      const { data, response } = await fetchJson(
        this.url(),
        { method: 'GET', headers },
        V4_CONFIG.timeouts.requestMs,
        'Запрос к Supabase не ответил вовремя'
      );
      return { data, error: null, status: response.status };
    } catch (error) {
      if (this.singleMode && error.status === 406) return { data: null, error: null, status: 406 };
      return { data: null, error, status: error.status || 0 };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }
}

export const supabaseClient = {
  auth: {
    async getSession() {
      const session = await timeout(currentSession(), V4_CONFIG.timeouts.sessionMs, 'Проверка входа не ответила вовремя');
      return { data: { session }, error: null };
    },
    async signInWithPassword(credentials) {
      try {
        const { data } = await fetchJson(
          `${V4_CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`,
          { method: 'POST', headers: baseHeaders, body: JSON.stringify({ email: credentials.email, password: credentials.password }) },
          V4_CONFIG.timeouts.loginMs,
          'Сервер входа не ответил вовремя'
        );
        const session = normalizeSession(data);
        if (!session?.access_token) throw new Error('Supabase не вернул сессию');
        saveSession(session);
        return { data: { session, user: session.user }, error: null };
      } catch (error) {
        return { data: { session: null, user: null }, error };
      }
    },
    async signOut() {
      await timeout(Promise.resolve(clearSession()), V4_CONFIG.timeouts.logoutMs, 'Выход не завершился вовремя');
      return { error: null };
    }
  },
  from(table) {
    return new QueryBuilder(table);
  }
};

window.LeaderV4 = window.LeaderV4 || {};
window.LeaderV4.supabase = supabaseClient;
