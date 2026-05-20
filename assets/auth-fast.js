(function(){
  function el(id){return document.getElementById(id)}
  function toast(s){var t=el('toast');if(t){t.textContent=s;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2300)}else alert(s)}
  function setStatus(text,ok){
    var s=el('authStatus'); if(s){s.textContent=text;s.className='muted '+(ok?'good':'warn')}
    var b=el('authFastBox');
    if(!b){var a=el('auth'); if(a){b=document.createElement('div');b.id='authFastBox';b.style.marginTop='10px';b.style.padding='10px';b.style.borderRadius='12px';b.style.border='1px solid #fed7aa';a.appendChild(b)}}
    if(b){b.textContent=text;b.style.background=ok?'#f0fdf4':'#fff7ed';b.style.borderColor=ok?'#bbf7d0':'#fed7aa';b.style.color=ok?'#065f46':'#92400e'}
  }
  async function check(){
    try{
      if(!window.db||!window.db.auth){setStatus('Supabase ещё загружается...',false);return null}
      var r=await window.db.auth.getSession();
      var s=r&&r.data?r.data.session:null;
      if(!s||!s.user){setStatus('Вход не выполнен. Введите email и пароль.',false);return null}
      var role='';
      try{var p=await window.db.from('leader_user_profiles').select('role,is_active').eq('user_id',s.user.id).maybeSingle();if(p&&p.data)role=' • роль: '+p.data.role+(p.data.is_active?'':' • отключён')}catch(e){role=' • профиль проверяется'}
      setStatus('Вход подтверждён: '+s.user.email+role,true);
      var login=el('login'),logout=el('logout'),email=el('email'),pass=el('pass');
      if(login)login.classList.add('hidden'); if(logout)logout.classList.remove('hidden'); if(email)email.classList.add('hidden'); if(pass)pass.classList.add('hidden');
      return s;
    }catch(e){setStatus('Ошибка проверки входа: '+e.message,false);return null}
  }
  async function doLogin(){
    var email=(el('email')&&el('email').value||'').trim(),pass=el('pass')&&el('pass').value||'';
    if(!email||!pass){alert('Введите email и пароль');return}
    setStatus('Выполняю вход...',false);
    try{var r=await window.db.auth.signInWithPassword({email:email,password:pass});if(r.error){alert(r.error.message);setStatus('Вход не выполнен: '+r.error.message,false);return}toast('Вход выполнен');await check()}catch(e){alert(e.message);setStatus('Ошибка входа: '+e.message,false)}
  }
  async function doLogout(){try{await window.db.auth.signOut()}catch(e){};var login=el('login'),logout=el('logout'),email=el('email'),pass=el('pass');if(login)login.classList.remove('hidden');if(logout)logout.classList.add('hidden');if(email)email.classList.remove('hidden');if(pass)pass.classList.remove('hidden');setStatus('Вход не выполнен. Введите email и пароль.',false);toast('Выход выполнен')}
  function bind(){
    var l=el('login'); if(l&&!l.dataset.authFast){var nl=l.cloneNode(true);nl.dataset.authFast='1';nl.onclick=function(e){e.preventDefault();e.stopPropagation();doLogin();return false};l.parentNode.replaceChild(nl,l)}
    var o=el('logout'); if(o&&!o.dataset.authFast){var no=o.cloneNode(true);no.dataset.authFast='1';no.onclick=function(e){e.preventDefault();e.stopPropagation();doLogout();return false};o.parentNode.replaceChild(no,o)}
    var host=document.querySelector('#auth .row .row'); if(host&&!el('authFastCheck')){var b=document.createElement('button');b.id='authFastCheck';b.textContent='Проверить вход';b.onclick=check;host.appendChild(b)}
  }
  window.LeaderAuthFast={check:check,login:doLogin,logout:doLogout};
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){bind();check()},500);setInterval(function(){bind();check()},10000)});
})();