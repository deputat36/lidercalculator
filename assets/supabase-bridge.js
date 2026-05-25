// Shared Supabase client for CRM «Лидер» optional extensions.
// The key is publishable; access is controlled by Supabase RLS policies.
window.LEADER_SUPABASE_URL = 'https://ofewxuqfjhamgerwzull.supabase.co';
window.LEADER_SUPABASE_KEY = 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs';
window.LEADER_SUPABASE_AUTH_STORAGE = 'leader_session_v1';

(function(){
  function nowSec(){ return Math.floor(Date.now()/1000); }
  function safeJson(text, fallback){ try { return JSON.parse(text); } catch(e){ return fallback; } }
  function storageKey(options){ return (options && options.auth && options.auth.storageKey) || window.LEADER_SUPABASE_AUTH_STORAGE || 'leader_session_v1'; }
  function saveSession(key, session){ try { localStorage.setItem(key, JSON.stringify(session || null)); } catch(e){} }
  function readSession(key){ try { return safeJson(localStorage.getItem(key), null); } catch(e){ return null; } }
  function clearSession(key){ try { localStorage.removeItem(key); } catch(e){} }
  function enc(v){ return encodeURIComponent(String(v == null ? '' : v)); }
  function errObj(message, status){ return { message: message || 'Unknown error', status: status || 0 }; }
  function normalizeError(payload, fallback, status){
    if(!payload) return errObj(fallback, status);
    if(typeof payload === 'string') return errObj(payload || fallback, status);
    return errObj(payload.message || payload.error_description || payload.error || fallback, status);
  }

  async function fetchJson(url, opts){
    var res, text, payload;
    try { res = await fetch(url, opts || {}); }
    catch(e){ return { data:null, error:errObj(e.message || 'Network request failed', 0), status:0, headers:null }; }
    try { text = await res.text(); } catch(e){ text = ''; }
    payload = text ? safeJson(text, text) : null;
    if(!res.ok) return { data:null, error:normalizeError(payload, res.statusText, res.status), status:res.status, headers:res.headers };
    return { data:payload, error:null, status:res.status, headers:res.headers };
  }

  function makeLiteSupabase(){
    function createClient(url, key, options){
      var skey = storageKey(options);
      var baseHeaders = { apikey:key, 'Content-Type':'application/json' };

      async function currentSession(){
        var s = readSession(skey);
        if(!s || !s.access_token) return null;
        if(s.expires_at && s.expires_at <= nowSec()+30 && s.refresh_token){
          var refreshed = await fetchJson(url + '/auth/v1/token?grant_type=refresh_token', {
            method:'POST', headers:baseHeaders, body:JSON.stringify({ refresh_token:s.refresh_token })
          });
          if(refreshed.error){ clearSession(skey); return null; }
          s = buildSession(refreshed.data);
          saveSession(skey, s);
        }
        return s;
      }
      function buildSession(data){
        if(!data) return null;
        return {
          access_token:data.access_token,
          refresh_token:data.refresh_token,
          expires_in:data.expires_in,
          expires_at:data.expires_at || (data.expires_in ? nowSec()+Number(data.expires_in) : null),
          token_type:data.token_type || 'bearer',
          user:data.user || null
        };
      }
      async function authHeaders(){
        var s = await currentSession();
        var headers = Object.assign({}, baseHeaders);
        if(s && s.access_token) headers.Authorization = 'Bearer ' + s.access_token;
        return headers;
      }

      function Query(table){
        this.table = table; this.method = 'GET'; this.columns = '*'; this.filters = [];
        this.orders = []; this.limitCount = null; this.body = null; this.wantSingle = false;
        this.wantMaybeSingle = false; this.head = false; this.count = null; this.prefer = [];
      }
      Query.prototype.select = function(cols, opts){ this.columns = cols || '*'; opts = opts || {}; this.head = !!opts.head; this.count = opts.count || null; if(this.method !== 'GET' && this.prefer.indexOf('return=representation') < 0) this.prefer.push('return=representation'); return this; };
      Query.prototype.eq = function(col, val){ this.filters.push({ col:col, op:'eq', val:val }); return this; };
      Query.prototype.in = function(col, vals){ this.filters.push({ col:col, op:'in', val:Array.isArray(vals)?vals:[] }); return this; };
      Query.prototype.order = function(col, opts){ opts = opts || {}; this.orders.push(col + '.' + (opts.ascending === false ? 'desc' : 'asc')); return this; };
      Query.prototype.limit = function(count){ this.limitCount = count; return this; };
      Query.prototype.single = function(){ this.wantSingle = true; return this; };
      Query.prototype.maybeSingle = function(){ this.wantMaybeSingle = true; return this; };
      Query.prototype.insert = function(body){ this.method = 'POST'; this.body = body; if(this.prefer.indexOf('return=representation') < 0) this.prefer.push('return=representation'); return this; };
      Query.prototype.update = function(body){ this.method = 'PATCH'; this.body = body; if(this.prefer.indexOf('return=representation') < 0) this.prefer.push('return=representation'); return this; };
      Query.prototype.delete = function(){ this.method = 'DELETE'; if(this.prefer.indexOf('return=representation') < 0) this.prefer.push('return=representation'); return this; };
      Query.prototype.url = function(){
        var q = ['select=' + enc(this.columns || '*')];
        this.filters.forEach(function(f){
          if(f.op === 'in') q.push(enc(f.col) + '=in.(' + f.val.map(function(x){ return String(x).replace(/,/g, '%2C'); }).join(',') + ')');
          else q.push(enc(f.col) + '=' + f.op + '.' + enc(f.val));
        });
        if(this.orders.length) q.push('order=' + enc(this.orders.join(',')));
        if(this.limitCount != null) q.push('limit=' + enc(this.limitCount));
        return url + '/rest/v1/' + this.table + '?' + q.join('&');
      };
      Query.prototype.execute = async function(){
        var headers = await authHeaders();
        if(this.count) headers.Prefer = (headers.Prefer ? headers.Prefer + ',' : '') + 'count=' + this.count;
        if(this.prefer.length) headers.Prefer = (headers.Prefer ? headers.Prefer + ',' : '') + this.prefer.join(',');
        if(this.wantSingle || this.wantMaybeSingle) headers.Accept = 'application/vnd.pgrst.object+json';
        var opts = { method:this.head ? 'HEAD' : this.method, headers:headers };
        if(this.body != null && !this.head) opts.body = JSON.stringify(this.body);
        var r = await fetchJson(this.url(), opts);
        var count = null;
        if(r.headers && r.headers.get('content-range')){
          var m = String(r.headers.get('content-range')).match(/\/(\d+|\*)$/);
          if(m && m[1] !== '*') count = Number(m[1]);
        }
        if(r.error && this.wantMaybeSingle && (r.status === 406 || /0 rows|multiple/i.test(r.error.message || ''))) return { data:null, error:null, count:count, status:r.status };
        return { data:r.data, error:r.error, count:count, status:r.status };
      };
      Query.prototype.then = function(resolve, reject){ return this.execute().then(resolve, reject); };
      Query.prototype.catch = function(reject){ return this.execute().catch(reject); };

      return {
        __leaderLiteClient:true,
        auth:{
          getSession: async function(){ return { data:{ session: await currentSession() }, error:null }; },
          getUser: async function(){
            var s = await currentSession();
            if(!s) return { data:{ user:null }, error:null };
            var r = await fetchJson(url + '/auth/v1/user', { method:'GET', headers: await authHeaders() });
            return r.error ? { data:{ user:null }, error:r.error } : { data:{ user:r.data }, error:null };
          },
          signInWithPassword: async function(creds){
            var r = await fetchJson(url + '/auth/v1/token?grant_type=password', { method:'POST', headers:baseHeaders, body:JSON.stringify({ email:creds.email, password:creds.password }) });
            if(r.error) return { data:{ user:null, session:null }, error:r.error };
            var session = buildSession(r.data); saveSession(skey, session);
            return { data:{ user:session.user, session:session }, error:null };
          },
          signOut: async function(){ clearSession(skey); return { error:null }; },
          onAuthStateChange: function(){ return { data:{ subscription:{ unsubscribe:function(){} } } }; }
        },
        from:function(table){ return new Query(table); },
        functions:{
          invoke: async function(name, opts){
            opts = opts || {};
            var headers = await authHeaders();
            var r = await fetchJson(url + '/functions/v1/' + name, { method:'POST', headers:headers, body:JSON.stringify(opts.body || {}) });
            return { data:r.data, error:r.error };
          }
        },
        rpc:function(name, opts){
          var q = new Query('rpc/' + name); q.method = 'POST'; q.body = opts || {}; return q;
        }
      };
    }
    return { createClient:createClient };
  }

  if(!window.supabase){
    window.supabase = makeLiteSupabase();
    window.LEADER_SUPABASE_CLIENT_SOURCE = 'local-lite-fallback';
  } else {
    window.LEADER_SUPABASE_CLIENT_SOURCE = 'official-supabase-js';
  }

  if (window.supabase && !window.db) {
    window.db = window.supabase.createClient(window.LEADER_SUPABASE_URL, window.LEADER_SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: window.LEADER_SUPABASE_AUTH_STORAGE
      }
    });
  }
})();
