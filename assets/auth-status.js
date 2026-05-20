(function(){
  function box(){
    var auth=document.getElementById('auth');
    if(!auth) return null;
    var b=document.getElementById('authVisibleStatus');
    if(!b){
      b=document.createElement('div');
      b.id='authVisibleStatus';
      b.style.marginTop='10px';
      b.style.padding='10px';
      b.style.borderRadius='12px';
      b.style.border='1px solid #fed7aa';
      b.style.background='#fff7ed';
      b.style.color='#92400e';
      auth.appendChild(b);
    }
    return b;
  }
  function paint(text, ok){
    var b=box();
    if(b){
      b.textContent=text;
      b.style.borderColor=ok?'#bbf7d0':'#fed7aa';
      b.style.background=ok?'#f0fdf4':'#fff7ed';
      b.style.color=ok?'#065f46':'#92400e';
    }
    var s=document.getElementById('authStatus');
    if(s){
      s.textContent=text;
      s.className='muted '+(ok?'good':'warn');
    }
  }
  async function check(){
    try{
      if(!window.db || !window.db.auth){ paint('Supabase ещё не загружен',false); return; }
      var r=await window.db.auth.getSession();
      var session=r && r.data ? r.data.session : null;
      if(!session || !session.user){ paint('Вход не выполнен. Введите email и пароль.',false); return; }
      var email=session.user.email || 'пользователь';
      var role='';
      try{
        var p=await window.db.from('leader_user_profiles').select('role,is_active').eq('user_id',session.user.id).maybeSingle();
        if(p && p.data) role=' • роль: '+p.data.role+(p.data.is_active?'':' • отключён');
      }catch(e){ role=' • вход есть, профиль не проверен'; }
      paint('Вход подтверждён: '+email+role,true);
      var login=document.getElementById('login'), logout=document.getElementById('logout'), email=document.getElementById('email'), pass=document.getElementById('pass');
      if(login) login.classList.add('hidden');
      if(logout) logout.classList.remove('hidden');
      if(email) email.classList.add('hidden');
      if(pass) pass.classList.add('hidden');
    }catch(e){ paint('Ошибка проверки входа: '+e.message,false); }
  }
  function addBtn(){
    var host=document.querySelector('#auth .row .row');
    if(!host || document.getElementById('authStatusBtn')) return;
    var b=document.createElement('button');
    b.id='authStatusBtn';
    b.textContent='Проверить вход';
    b.onclick=check;
    host.appendChild(b);
  }
  window.LeaderAuthStatus={check:check};
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){addBtn();check();},1200);setInterval(check,10000)});
})();