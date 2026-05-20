(function(){
  function el(id){return document.getElementById(id)}
  function toast(text){var t=el('toast');if(t){t.textContent=text;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2300)}else alert(text)}
  function setAuth(text,ok){var s=el('authState');if(s){s.textContent=text;s.className='auth-state '+(ok?'good':'warn')}}
  function withTimeout(p,ms,label){return Promise.race([p,new Promise(function(_,reject){setTimeout(function(){reject(new Error(label||'Превышено время ожидания'))},ms)})])}
  function clearStoredSession(){
    try{Object.keys(localStorage).forEach(function(k){if(k.indexOf('supabase')!==-1||k.indexOf('sb-')===0||k.indexOf('ofewxuqfjhamgerwzull')!==-1)localStorage.removeItem(k)})}catch(e){}
    try{Object.keys(sessionStorage).forEach(function(k){if(k.indexOf('supabase')!==-1||k.indexOf('sb-')===0||k.indexOf('ofewxuqfjhamgerwzull')!==-1)sessionStorage.removeItem(k)})}catch(e){}
  }
  async function check(){
    try{
      if(!window.db||!window.db.auth){setAuth('Supabase ещё загружается...',false);return false}
      var r=await withTimeout(window.db.auth.getSession(),10000,'Не удалось проверить вход за 10 секунд');
      var s=r&&r.data?r.data.session:null;
      if(!s||!s.user){setAuth('Вход не выполнен. Введите email и пароль.',false);var f=el('authForm'),o=el('logoutBtn');if(f)f.classList.remove('hidden');if(o)o.classList.add('hidden');return false}
      setAuth('Вход выполнен: '+(s.user.email||'пользователь'),true);
      var form=el('authForm'),out=el('logoutBtn');if(form)form.classList.add('hidden');if(out)out.classList.remove('hidden');
      return true;
    }catch(e){setAuth('Ошибка входа/сессии: '+e.message,false);return false}
  }
  async function login(){
    var email=(el('loginEmail')&&el('loginEmail').value||'').trim();
    var pass=el('loginPassword')&&el('loginPassword').value||'';
    if(!email||!pass){alert('Введите email и пароль');return}
    setAuth('Выполняю вход...',false);
    try{
      clearStoredSession();
      var r=await withTimeout(window.db.auth.signInWithPassword({email:email,password:pass}),20000,'Вход не завершился за 20 секунд');
      if(r.error){setAuth('Вход не выполнен: '+r.error.message,false);alert(r.error.message);return}
      setAuth('Вход выполнен: '+email,true);
      var form=el('authForm'),out=el('logoutBtn');if(form)form.classList.add('hidden');if(out)out.classList.remove('hidden');
      toast('Вход выполнен');
      setTimeout(function(){
        if(window.LeaderV2Orders&&window.LeaderV2Orders.load)window.LeaderV2Orders.load(true).catch(function(){});
      },500);
    }catch(e){setAuth('Ошибка входа: '+e.message,false);alert(e.message)}
  }
  async function logout(){
    setAuth('Выполняю выход...',false);
    try{if(window.db&&window.db.auth)await withTimeout(window.db.auth.signOut(),10000,'Выход не завершился за 10 секунд')}catch(e){}
    clearStoredSession();
    var form=el('authForm'),out=el('logoutBtn');if(form)form.classList.remove('hidden');if(out)out.classList.add('hidden');
    setAuth('Вход не выполнен. Введите email и пароль.',false);
    toast('Выход выполнен');
  }
  function bind(){
    var l=el('loginBtn');
    if(l&&!l.dataset.v2AuthFix){var nl=l.cloneNode(true);nl.dataset.v2AuthFix='1';nl.onclick=function(e){e.preventDefault();login();return false};l.parentNode.replaceChild(nl,l)}
    var o=el('logoutBtn');
    if(o&&!o.dataset.v2AuthFix){var no=o.cloneNode(true);no.dataset.v2AuthFix='1';no.onclick=function(e){e.preventDefault();logout();return false};o.parentNode.replaceChild(no,o)}
    var host=document.querySelector('.auth-card');
    if(host&&!el('resetAuthBtn')){var b=document.createElement('button');b.id='resetAuthBtn';b.textContent='Сбросить вход';b.title='Очистить старую сессию и токены';b.onclick=function(){clearStoredSession();setAuth('Сессия очищена. Введите email и пароль.',false);var f=el('authForm'),out=el('logoutBtn');if(f)f.classList.remove('hidden');if(out)out.classList.add('hidden');toast('Старая сессия очищена')};host.appendChild(b)}
  }
  window.LeaderV2AuthFix={check:check,login:login,logout:logout,clear:clearStoredSession,bind:bind};
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){bind();check()},300);setInterval(bind,3000)});
})();
