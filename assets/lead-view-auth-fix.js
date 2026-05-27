(function(){
  var AUTH_TIMEOUT=15000;
  function q(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function withTimeout(p,ms,msg){return Promise.race([p,new Promise(function(_,rej){setTimeout(function(){rej(new Error(msg||'Превышено время ожидания'))},ms)})])}
  function setState(text,type){
    var el=q('authState');
    if(!el)return;
    el.textContent=text;
    el.className='leadv3-state '+(type==='ok'?'ok':type==='bad'?'bad':'');
  }
  function clearSessions(){
    var patterns=['leader_session_v1','leader_','ofewxuqfjhamgerwzull-auth-token'];
    try{Object.keys(localStorage).forEach(function(k){if(patterns.some(function(p){return k.indexOf(p)>=0}))localStorage.removeItem(k)})}catch(e){}
    try{Object.keys(sessionStorage).forEach(function(k){if(patterns.some(function(p){return k.indexOf(p)>=0}))sessionStorage.removeItem(k)})}catch(e){}
  }
  function setInputsVisible(show){
    ['loginEmail','loginPassword','loginBtn'].forEach(function(id){var x=q(id);if(x)x.style.display=show?'':'none'});
    var out=q('leadV3LogoutBtn');if(out)out.style.display=show?'none':'';
    var reset=q('leadV3ResetBtn');if(reset)reset.style.display='';
  }
  function addButtons(){
    var host=document.querySelector('.leadv3-actions');
    if(!host)return;
    if(!q('leadV3LogoutBtn')){
      var b=document.createElement('button');
      b.id='leadV3LogoutBtn';b.type='button';b.className='leadv3-btn';b.textContent='Выйти';b.style.display='none';
      host.appendChild(b);
    }
    if(!q('leadV3ResetBtn')){
      var r=document.createElement('button');
      r.id='leadV3ResetBtn';r.type='button';r.className='leadv3-btn';r.textContent='Сбросить вход';
      host.appendChild(r);
    }
    if(!q('leadV3AuthInfo')){
      var info=document.createElement('div');
      info.id='leadV3AuthInfo';info.className='leadv3-auth-info';
      host.parentNode.appendChild(info);
    }
  }
  function renderInfo(text,kind){
    var info=q('leadV3AuthInfo');
    if(!info)return;
    info.className='leadv3-auth-info '+(kind||'');
    info.innerHTML=text;
  }
  async function getSession(){
    if(!window.db)throw new Error('Supabase-клиент ещё не создан');
    var r=await withTimeout(db.auth.getSession(),AUTH_TIMEOUT,'Проверка входа не ответила за '+Math.round(AUTH_TIMEOUT/1000)+' секунд');
    return r.data&&r.data.session?r.data.session:null;
  }
  async function getProfile(userId){
    if(!userId)return null;
    var r=await withTimeout(db.from('leader_user_profiles').select('email,role,is_active,full_name').eq('user_id',userId).maybeSingle(),AUTH_TIMEOUT,'Профиль CRM не загрузился');
    if(r.error)throw new Error(r.error.message);
    return r.data||null;
  }
  async function checkAuth(){
    addButtons();
    setState('Проверяю вход...','warn');
    renderInfo('Проверяю текущую сессию CRM...', 'warn');
    try{
      var session=await getSession();
      if(!session||!session.user){
        setState('Нужен вход','warn');
        setInputsVisible(true);
        renderInfo('Вход не выполнен. Введите email и пароль от CRM. Если форма зависла после старой сессии — нажмите «Сбросить вход».','warn');
        stopEndlessLoading('Войдите в CRM, чтобы открыть заявку.');
        return false;
      }
      var profile=await getProfile(session.user.id);
      if(!profile||!profile.is_active){
        setState('Нет доступа к CRM','bad');
        setInputsVisible(true);
        renderInfo('Аккаунт найден, но профиль CRM не активен. Проверьте пользователя в таблице leader_user_profiles.','bad');
        stopEndlessLoading('Нет активного профиля CRM для этого пользователя.');
        return false;
      }
      setState('Вход выполнен','ok');
      setInputsVisible(false);
      renderInfo('Вход выполнен: <b>'+esc(session.user.email||profile.email||'пользователь')+'</b>'+(profile.role?' • роль: '+esc(profile.role):'')+'. Если данные заявки не появились — нажмите «Обновить».','ok');
      return true;
    }catch(err){
      setState('Ошибка входа','bad');
      setInputsVisible(true);
      renderInfo('Ошибка проверки входа: '+esc(err.message||err)+'. Попробуйте «Сбросить вход» и войти заново.','bad');
      stopEndlessLoading('Ошибка авторизации: '+(err.message||err));
      return false;
    }
  }
  function stopEndlessLoading(msg){
    var main=q('leadMain');
    if(main&&/Загружаю|Загрузка/i.test(main.textContent||''))main.innerHTML='<div class="muted">'+esc(msg)+'</div>';
    var next=q('nextAction');
    if(next&&!next.textContent)next.textContent='Сначала нужно выполнить вход.';
  }
  async function robustLogin(ev){
    var btn=ev.target.closest('#loginBtn');
    if(!btn)return;
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    var email=(q('loginEmail')&&q('loginEmail').value||'').trim();
    var pass=q('loginPassword')&&q('loginPassword').value||'';
    if(!email||!pass){alert('Введите email и пароль');return}
    btn.disabled=true;var old=btn.textContent;btn.textContent='Вхожу...';
    setState('Выполняю вход...','warn');renderInfo('Отправляю данные входа...', 'warn');
    try{
      clearSessions();
      await new Promise(function(r){setTimeout(r,150)});
      var r=await withTimeout(db.auth.signInWithPassword({email:email,password:pass}),25000,'Сервер входа не ответил за 25 секунд');
      if(r.error)throw new Error(r.error.message);
      setState('Вход выполнен','ok');renderInfo('Вход выполнен. Перезагружаю карточку заявки...', 'ok');
      setInputsVisible(false);
      setTimeout(function(){location.reload()},500);
    }catch(err){
      setState('Вход не выполнен','bad');renderInfo('Вход не выполнен: '+esc(err.message||err), 'bad');alert(err.message||err);
    }finally{btn.disabled=false;btn.textContent=old;}
  }
  async function logout(){
    try{if(window.db)await withTimeout(db.auth.signOut(),8000,'Выход не ответил')}catch(e){}
    clearSessions();
    setState('Вы вышли','warn');setInputsVisible(true);renderInfo('Сессия очищена. Войдите заново.', 'warn');
    stopEndlessLoading('Вы вышли из CRM.');
  }
  function bind(){
    document.addEventListener('click',robustLogin,true);
    document.addEventListener('click',function(ev){
      if(ev.target.closest('#leadV3LogoutBtn')){ev.preventDefault();logout()}
      if(ev.target.closest('#leadV3ResetBtn')){ev.preventDefault();logout()}
      if(ev.target.closest('#reloadBtn')){setTimeout(checkAuth,300)}
    },true);
  }
  function addCss(){
    if(q('leadV3AuthFixCss'))return;
    var s=document.createElement('style');s.id='leadV3AuthFixCss';s.textContent='.leadv3-state.bad{background:#fee2e2;color:#991b1b}.leadv3-auth-info{margin-top:8px;padding:9px 11px;border-radius:12px;background:#f9fafb;border:1px solid #e5e7eb;color:#374151;font-size:13px;line-height:1.45}.leadv3-auth-info.ok{background:#dcfce7;border-color:#bbf7d0;color:#166534}.leadv3-auth-info.warn{background:#fef3c7;border-color:#fde68a;color:#92400e}.leadv3-auth-info.bad{background:#fee2e2;border-color:#fecaca;color:#991b1b}';document.head.appendChild(s);
  }
  function waitForShell(){
    var tries=0;
    var timer=setInterval(function(){
      tries++;
      if(q('authState')){clearInterval(timer);addCss();addButtons();bind();checkAuth();setTimeout(function(){stopEndlessLoading('Данные не загрузились. Проверьте вход и id заявки, затем нажмите «Обновить».')},12000)}
      if(tries>80){clearInterval(timer);var root=q('leadViewRoot');if(root)root.innerHTML='<div class="leadv3"><div class="leadv3-card"><h2>Карточка заявки не загрузилась</h2><p class="muted">Скрипт страницы не создал интерфейс за 8 секунд. Обновите страницу или откройте CRM заново.</p></div></div>'}
    },100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',waitForShell);else waitForShell();
})();
