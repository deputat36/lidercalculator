// Auth repair tools for RA Lider CRM.
(function(){
  function toast(msg){
    var t=document.getElementById('toast');
    if(!t){ alert(msg); return; }
    t.textContent=msg;
    t.classList.add('show');
    setTimeout(function(){t.classList.remove('show')},2300);
  }
  async function clearAuth(){
    try{
      if(window.db && window.db.auth) await window.db.auth.signOut({scope:'local'});
    }catch(e){ console.warn(e); }
    Object.keys(localStorage).forEach(function(k){
      if(k.indexOf('supabase')!==-1 || k.indexOf('sb-')===0 || k.indexOf('ofewxuqfjhamgerwzull')!==-1){
        localStorage.removeItem(k);
      }
    });
    Object.keys(sessionStorage).forEach(function(k){
      if(k.indexOf('supabase')!==-1 || k.indexOf('sb-')===0 || k.indexOf('ofewxuqfjhamgerwzull')!==-1){
        sessionStorage.removeItem(k);
      }
    });
  }
  function addButton(){
    var host=document.querySelector('#auth .row .row');
    if(!host || document.getElementById('authRepairBtn')) return;
    var btn=document.createElement('button');
    btn.id='authRepairBtn';
    btn.textContent='Сбросить вход';
    btn.title='Очистить старые токены Supabase и перезагрузить страницу';
    btn.onclick=async function(){
      if(!confirm('Очистить старую сессию входа и перезагрузить страницу?')) return;
      await clearAuth();
      toast('Сессия очищена. Перезагрузка...');
      setTimeout(function(){ location.reload(true); },700);
    };
    host.appendChild(btn);
  }
  window.LeaderAuthRepair={clearAuth:clearAuth, addButton:addButton};
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(addButton,900); });
})();
