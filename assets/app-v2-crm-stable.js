(function(){
  'use strict';
  var sessionCache = null;
  var profileCache = null;
  var leadsBusy = false;
  var bootedEnhancements = false;
  var PROFILE_TIMEOUT_MS = 4500;
  var SESSION_TIMEOUT_MS = 9000;
  var LOGIN_TIMEOUT_MS = 18000;
  var LEADS_TIMEOUT_MS = 14000;
  var LEADS_LIMIT = 50;

  function e(id){ return document.getElementById(id); }
  function st(){ try { return window.eval('state'); } catch(_){ return null; } }
  function call(name){
    try {
      var fn = window[name] || window.eval(name);
      if(typeof fn === 'function') return fn.apply(null, Array.prototype.slice.call(arguments, 1));
    } catch(_) {}
  }
  function text(v){ return String(v == null ? '' : v).trim(); }
  function msg(err){ return err && err.message ? err.message : String(err || 'Ошибка'); }
  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  function timeout(promise, ms, message){
    return Promise.race([
      promise,
      new Promise(function(_, reject){ setTimeout(function(){ reject(new Error(message || 'Превышено время ожидания')); }, ms); })
    ]);
  }
  function networkish(err){
    var s = msg(err).toLowerCase();
    return s.indexOf('failed to fetch') >= 0 || s.indexOf('network') >= 0 || s.indexOf('ожид') >= 0 || s.indexOf('timeout') >= 0;
  }
  async function retry(fn, tries, delay){
    var last = null;
    for(var i = 0; i < (tries || 2); i++){
      try { return await fn(); }
      catch(err){
        last = err;
        if(!networkish(err)) throw err;
        if(i < (tries || 2) - 1) await sleep((delay || 400) + i * 500);
      }
    }
    throw last;
  }
  function setAuthText(textValue, ok){ call('setAuth', textValue, !!ok); }
  function toast(textValue){ call('toast', textValue); }
  function setBusy(on, label){ call('setAuthBusy', !!on, label || 'Вхожу...'); }
  function hideLogin(session){
    var state = st();
    if(state){
      state.user = session && session.user ? session.user : null;
      if(!session || !session.user){ state.profile = null; state.crmReady = false; }
    }
    if(e('authForm')) e('authForm').classList.toggle('hidden', !!(session && session.user));
    if(e('logoutBtn')) e('logoutBtn').classList.toggle('hidden', !(session && session.user));
  }
  function clearSessionStorage(){
    call('clearLeaderSession');
    sessionCache = null;
    profileCache = null;
  }
  function roleSuffix(){
    var state = st();
    return state && state.profile && state.profile.role ? ' • роль: ' + state.profile.role : '';
  }
  async function getSessionSoft(){
    if(sessionCache && sessionCache.user) return sessionCache;
    var r = await timeout(window.db.auth.getSession(), SESSION_TIMEOUT_MS, 'Проверка входа не ответила за 9 секунд');
    var session = r && r.data ? r.data.session : null;
    if(session && session.user) sessionCache = session;
    return session;
  }
  async function requireSession(){
    var session = await getSessionSoft();
    if(!session || !session.user) throw new Error('Нужен вход');
    return session;
  }
  async function loadProfileInBackground(user){
    if(!user || !user.id) return null;
    if(profileCache && profileCache.user_id === user.id) return profileCache;
    try {
      var r = await timeout(
        window.db.from('leader_user_profiles').select('user_id,email,role,is_active,full_name').eq('user_id', user.id).maybeSingle(),
        PROFILE_TIMEOUT_MS,
        'Профиль догружается в фоне'
      );
      if(r.error) throw new Error(r.error.message || 'Профиль временно недоступен');
      profileCache = r.data || null;
      var state = st();
      if(state) state.profile = profileCache;
      if(sessionCache && sessionCache.user){
        var currentAuth = e('authState') && e('authState').textContent || '';
        setAuthText(currentAuth.indexOf('Заявки загружены') >= 0 ? currentAuth + roleSuffix() : 'CRM готова: ' + (sessionCache.user.email || 'пользователь') + roleSuffix(), true);
      }
      return profileCache;
    } catch(err){
      console.warn('leader_user_profiles background load skipped:', err);
      return null;
    }
  }
  function openCrmWithSession(session, statusText){
    sessionCache = session;
    hideLogin(session);
    var state = st();
    if(state){ state.user = session.user; state.crmReady = true; }
    setAuthText(statusText || ('CRM готова: ' + (session.user.email || 'пользователь') + roleSuffix()), true);
    loadProfileInBackground(session.user);
  }
  async function checkAuthStable(){
    try {
      setAuthText('Проверяю вход...', false);
      var session = await getSessionSoft();
      if(!session || !session.user){
        hideLogin(null);
        setAuthText('Нужен вход', false);
        return false;
      }
      openCrmWithSession(session, 'CRM готова: ' + (session.user.email || 'пользователь') + roleSuffix());
      return true;
    } catch(err){
      hideLogin(null);
      setAuthText(networkish(err) ? 'Ошибка сети при проверке входа' : 'Нужен вход', false);
      return false;
    }
  }
  async function apiStable(body){
    body = body || {};
    await requireSession();
    if(body.action === 'list') return listLeadsStable(body.limit || LEADS_LIMIT);
    if(body.action === 'create') return createLeadStable(body);
    if(body.action === 'update') return updateLeadStable(body);
    if(body.action === 'ensure_client') return ensureClientStable(body);
    var r = await timeout(window.db.functions.invoke('leader-crm-leads', { body: body }), 18000, 'CRM API не ответил за 18 секунд');
    if(r.error) throw new Error(r.error.message || 'Ошибка запроса');
    if(r.data && r.data.error) throw new Error(r.data.error + (r.data.details ? ': ' + r.data.details : ''));
    return r.data || {};
  }
  function leadFields(){
    return 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';
  }
  async function listLeadsStable(limit){
    await requireSession();
    var safeLimit = Math.max(30, Math.min(Number(limit || LEADS_LIMIT) || LEADS_LIMIT, 50));
    var r = await retry(function(){
      return timeout(
        window.db.from('leader_leads').select(leadFields()).order('created_at', { ascending:false }).limit(safeLimit),
        LEADS_TIMEOUT_MS,
        'Заявки не загрузились за 14 секунд'
      );
    }, 2, 500);
    if(r.error) throw new Error(r.error.message || 'Заявки временно недоступны');
    return { ok:true, leads:r.data || [] };
  }
  async function createLeadStable(body){
    await requireSession();
    var row = {
      name: text(body.name), phone: text(body.phone), source: text(body.source || 'Ручная заявка'),
      service: text(body.service), message: text(body.message), status: text(body.status || 'Новая'),
      budget: body.budget ? Number(body.budget) : null, city: text(body.city), page_url: text(body.page_url || 'manual://crm-v2')
    };
    if(!row.name && !row.phone && !row.message) throw new Error('Заполните имя, телефон или комментарий');
    var r = await timeout(window.db.from('leader_leads').insert(row).select('*').single(), LEADS_TIMEOUT_MS, 'Сохранение заявки не ответило за 14 секунд');
    if(r.error) throw new Error(r.error.message || 'Не удалось сохранить заявку');
    return { ok:true, lead:r.data };
  }
  async function updateLeadStable(body){
    await requireSession();
    var id = text(body.id), patch = {};
    if(!id) throw new Error('Не указан id заявки');
    ['status','lead_quality','message','reject_reason'].forEach(function(k){ if(k in body) patch[k] = text(body[k]); });
    if('estimated_amount' in body) patch.estimated_amount = body.estimated_amount ? Number(body.estimated_amount) : null;
    if('next_contact_at' in body) patch.next_contact_at = text(body.next_contact_at) || null;
    var r = await timeout(window.db.from('leader_leads').update(patch).eq('id', id).select('*').single(), LEADS_TIMEOUT_MS, 'Обновление заявки не ответило за 14 секунд');
    if(r.error) throw new Error(r.error.message || 'Не удалось обновить заявку');
    return { ok:true, lead:r.data };
  }
  async function ensureClientStable(body){
    await requireSession();
    var name = text(body.name), phone = text(body.phone);
    if(!name && !phone) throw new Error('Нужны имя или телефон клиента');
    if(phone){
      var found = await timeout(window.db.from('leader_clients').select('*').eq('phone', phone).limit(1), 12000, 'Поиск клиента не ответил за 12 секунд');
      if(found.error) throw new Error(found.error.message || 'Не удалось проверить клиента');
      if(found.data && found.data.length) return { ok:true, client:found.data[0], existed:true };
    }
    var row = { name:name || phone, phone:phone, source:text(body.source || 'CRM'), comment:text(body.comment) };
    var created = await timeout(window.db.from('leader_clients').insert(row).select('*').single(), 12000, 'Создание клиента не ответило за 12 секунд');
    if(created.error) throw new Error(created.error.message || 'Не удалось создать клиента');
    return { ok:true, client:created.data, existed:false };
  }
  async function loadLeadsStable(limit){
    if(leadsBusy) return (st() && st().leads) || [];
    leadsBusy = true;
    var box = e('leadList');
    if(box && (!st() || !(st().leads || []).length)) box.innerHTML = '<div class="empty">Загружаю заявки...</div>';
    try {
      setAuthText('Загружаю заявки...', true);
      var data = await apiStable({ action:'list', limit:limit || LEADS_LIMIT });
      var state = st();
      if(state){ state.leads = data.leads || []; state.leadsLoaded = true; state.crmReady = true; }
      call('fillSourceFilter');
      renderLeadsStable();
      call('renderDashboard');
      setAuthText('Заявки загружены: ' + ((data.leads || []).length) + ' • CRM готова', true);
      return data.leads || [];
    } catch(err){
      setAuthText(networkish(err) ? 'Ошибка сети при загрузке заявок' : 'Заявки не загрузились: ' + msg(err), false);
      if(box) box.innerHTML = '<div class="empty">Не удалось загрузить заявки. Проверьте интернет и нажмите «Обновить».</div>';
      throw err;
    } finally {
      leadsBusy = false;
    }
  }
  async function loadCrmDataStable(){
    var session = await requireSession();
    openCrmWithSession(session, 'CRM готова. Загружаю заявки...');
    await loadLeadsStable(LEADS_LIMIT);
    startEnhancementsAfterLeads();
  }
  async function loginStable(){
    var state = st();
    if(state && state.authBusy) return;
    var email = text(e('loginEmail') && e('loginEmail').value);
    var password = e('loginPassword') ? e('loginPassword').value : '';
    if(!email || !password){ alert('Введите email и пароль'); setAuthText('Нужен вход', false); return; }
    setBusy(true, 'Вхожу...');
    setAuthText('Выполняю вход...', false);
    try {
      clearSessionStorage();
      await sleep(100);
      var r = await timeout(window.db.auth.signInWithPassword({ email:email, password:password }), LOGIN_TIMEOUT_MS, 'Сервер входа не ответил за 18 секунд. Проверьте интернет и попробуйте ещё раз.');
      if(r.error) throw new Error(r.error.message || 'Вход не выполнен');
      var session = r.data && r.data.session;
      if(!session || !session.user) throw new Error('Вход не выполнен: сессия не получена');
      openCrmWithSession(session, 'CRM готова. Загружаю заявки...');
      await loadLeadsStable(LEADS_LIMIT);
      startEnhancementsAfterLeads();
      toast('Вход выполнен, заявки загружены');
    } catch(err){
      var hasSession = false;
      try { hasSession = !!(await getSessionSoft() || {}).user; } catch(_) {}
      if(hasSession){
        hideLogin(sessionCache);
        setAuthText('CRM готова. Заявки можно обновить.', true);
      } else {
        hideLogin(null);
        setAuthText(networkish(err) ? 'Ошибка сети' : 'Вход не выполнен: ' + msg(err), false);
        alert(msg(err));
      }
    } finally {
      setBusy(false);
    }
  }
  async function logoutStable(){
    var state = st();
    if(state && state.authBusy) return;
    setBusy(true, 'Выхожу...');
    setAuthText('Выполняю выход...', false);
    try { await timeout(window.db.auth.signOut(), 8000, 'Выход не завершился за 8 секунд'); } catch(_) {}
    clearSessionStorage();
    state = st();
    if(state){ state.user = null; state.profile = null; state.crmReady = false; state.leadsLoaded = false; state.leads = []; state.activeLead = null; }
    hideLogin(null);
    setAuthText('Нужен вход', false);
    call('renderDashboard');
    renderLeadsStable();
    call('renderCalcRows');
    toast('Вы вышли из CRM');
    setBusy(false);
  }
  function filteredLeadsStable(){
    var state = st();
    var leads = state && Array.isArray(state.leads) ? state.leads : [];
    var status = (e('leadStatusFilter') && e('leadStatusFilter').value) || 'active';
    var source = (e('leadSourceFilter') && e('leadSourceFilter').value) || 'Все';
    var q = text(e('leadSearch') && e('leadSearch').value).toLowerCase();
    return leads.filter(function(lead){
      var s = lead.status || 'Новая';
      if(status === 'active' && s === 'Спам') return false;
      if(status !== 'active' && status !== 'Все' && s !== status) return false;
      if(source !== 'Все' && (lead.source || 'Не указан') !== source) return false;
      if(q){
        var hay = [lead.name, lead.phone, lead.service, lead.message, lead.source, lead.city, lead.status].join(' ').toLowerCase();
        if(hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function ensureStableLeadStyles(){
    if(e('crmStableLeadStyles')) return;
    var style = document.createElement('style');
    style.id = 'crmStableLeadStyles';
    style.textContent = '.lead-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);background:#fff;color:var(--text);border-radius:12px;padding:10px 13px;text-decoration:none;font-weight:700}.lead-actions a:hover{border-color:#bfdbfe;background:#eff6ff}.lead-actions a[data-action=\"open-v3\"]{background:#111827;border-color:#111827;color:#fff}';
    document.head.appendChild(style);
  }
  function renderLeadsStable(){
    call('ensureLeadCardStyles');
    ensureStableLeadStyles();
    var box = e('leadList');
    if(!box) return;
    var state = st();
    var all = state && Array.isArray(state.leads) ? state.leads : [];
    var list = filteredLeadsStable();
    if(!all.length){
      box.innerHTML = state && state.leadsLoaded ? '<div class="empty">Заявки загружены, новых заявок пока нет.</div>' : '<div class="empty">Заявки загрузятся после входа.</div>';
      return;
    }
    if(!list.length){
      box.innerHTML = '<div class="empty">Заявки загружены, но по выбранному фильтру ничего нет.</div>';
      return;
    }
    box.innerHTML = list.map(function(lead){
      var statusHtml = call('statusBadge', lead.status || 'Новая') || ('<span class="badge">' + esc(lead.status || 'Новая') + '</span>');
      var clean = call('clearDetailsFromMessage', lead.message || '') || '';
      var details = call('renderLeadDetails', lead) || '';
      var contacts = call('contactLinks', lead) || '';
      var v3Url = 'lead-view.html?id=' + encodeURIComponent(lead.id || '');
      return '<article class="lead-card" data-id="' + esc(lead.id) + '"><div><div class="lead-title">' + esc(lead.name || 'Без имени') + ' ' + statusHtml + '</div>' +
        '<div class="meta">' + dt(lead.created_at) + ' • ' + esc(lead.source || 'Источник не указан') + ' • ' + esc(lead.service || 'Услуга не указана') + '</div>' +
        '<div class="meta">Телефон: ' + esc(lead.phone || '—') + (lead.budget ? ' • Бюджет: ' + money(lead.budget) : '') + '</div>' +
        details + (clean ? '<div class="lead-message"><strong>Комментарий:</strong><br><span class="lead-message-clean">' + esc(clean) + '</span></div>' : '') + contacts + '</div>' +
        '<div class="lead-actions"><select data-action="status">' + statusesOptions(lead.status || 'Новая') + '</select><button data-action="calc" class="primary">В расчёт</button><button data-action="client">Клиент</button><a class="button" data-action="open-v3" href="' + esc(v3Url) + '">Открыть v3</a><button data-action="spam">Спам</button></div></article>';
    }).join('');
  }
  function statusesOptions(current){
    var arr;
    try { arr = window.eval('statuses'); } catch(_){ arr = ['Новая','В работе','Уточнение деталей','Расчёт подготовлен','КП отправлено','Ждём ответ','Нужно пересчитать','Согласовано','Создан заказ','Отказ','Не отвечает','Дорого','Передумал','Спам']; }
    return arr.map(function(s){ return '<option ' + (s === current ? 'selected' : '') + '>' + esc(s) + '</option>'; }).join('');
  }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>\"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }
  function dt(v){ var r = call('dt', v); if(r != null) return r; try { return v ? new Date(v).toLocaleString('ru-RU') : '—'; } catch(_){ return v || '—'; } }
  function money(v){ var r = call('money', v); return r == null ? (Math.round(Number(v || 0)).toLocaleString('ru-RU') + ' ₽') : r; }
  function startEnhancementsAfterLeads(){
    if(bootedEnhancements) return;
    bootedEnhancements = true;
    setTimeout(function(){ try { if(window.LeaderV2Orders && window.LeaderV2Orders.load) window.LeaderV2Orders.load(true).catch(function(){}); } catch(_){} }, 900);
  }

  window.LeaderV2CrmStable = {
    checkAuth:checkAuthStable, login:loginStable, logout:logoutStable,
    loadCrmData:loadCrmDataStable, loadLeads:loadLeadsStable, renderLeads:renderLeadsStable,
    api:apiStable, filteredLeads:filteredLeadsStable
  };
  try { window.api = apiStable; api = apiStable; } catch(_){ window.api = apiStable; }
  try { window.checkAuth = checkAuthStable; checkAuth = checkAuthStable; } catch(_){ window.checkAuth = checkAuthStable; }
  try { window.login = loginStable; login = loginStable; } catch(_){ window.login = loginStable; }
  try { window.logout = logoutStable; logout = logoutStable; } catch(_){ window.logout = logoutStable; }
  try { window.loadCrmData = loadCrmDataStable; loadCrmData = loadCrmDataStable; } catch(_){ window.loadCrmData = loadCrmDataStable; }
  try { window.loadLeads = loadLeadsStable; loadLeads = loadLeadsStable; } catch(_){ window.loadLeads = loadLeadsStable; }
  try { window.renderLeads = renderLeadsStable; renderLeads = renderLeadsStable; } catch(_){ window.renderLeads = renderLeadsStable; }
  try { window.filteredLeads = filteredLeadsStable; filteredLeads = filteredLeadsStable; } catch(_){ window.filteredLeads = filteredLeadsStable; }
})();
