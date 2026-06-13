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

function preferHeader(values) {
  return values.filter(Boolean).join(',');
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.columns = '*';
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.singleMode = false;
    this.method = 'GET';
    this.body = null;
    this.prefer = [];
  }

  select(columns = '*') {
    this.columns = columns;
    if (this.method !== 'GET' && !this.prefer.includes('return=representation')) this.prefer.push('return=representation');
    return this;
  }

  eq(column, value) {
    this.filters.push(`${encode(column)}=eq.${encode(value)}`);
    return this;
  }

  order(column, options = {}) {
    this.orders.push(`${column}.${options.ascending === false ? 'desc' : 'asc'}`);
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.singleMode = true;
    return this;
  }

  single() {
    this.singleMode = true;
    return this;
  }

  insert(body) {
    this.method = 'POST';
    this.body = body;
    if (!this.prefer.includes('return=representation')) this.prefer.push('return=representation');
    return this;
  }

  update(body) {
    this.method = 'PATCH';
    this.body = body;
    if (!this.prefer.includes('return=representation')) this.prefer.push('return=representation');
    return this;
  }

  delete() {
    this.method = 'DELETE';
    this.body = null;
    return this;
  }

  url() {
    const query = this.method === 'DELETE' ? [...this.filters] : [`select=${encode(this.columns)}`, ...this.filters];
    if (this.orders.length && this.method !== 'DELETE') query.push(`order=${encode(this.orders.join(','))}`);
    if (this.limitCount !== null && this.method !== 'DELETE') query.push(`limit=${encode(this.limitCount)}`);
    return `${V4_CONFIG.supabaseUrl}/rest/v1/${this.table}?${query.join('&')}`;
  }

  async execute() {
    try {
      const headers = await authHeaders();
      if (this.singleMode) headers.Accept = 'application/vnd.pgrst.object+json';
      if (this.prefer.length) headers.Prefer = preferHeader(this.prefer);
      const options = { method: this.method, headers };
      if (this.body !== null) options.body = JSON.stringify(this.body);
      const { data, response } = await fetchJson(
        this.url(),
        options,
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
