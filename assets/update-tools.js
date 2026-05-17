// App update and cache tools for RA Lider CRM.
(function(){
  function toast(msg){
    var t=document.getElementById('toast');
    if(!t){ alert(msg); return; }
    t.textContent=msg;
    t.classList.add('show');
    setTimeout(function(){t.classList.remove('show')},2500);
  }
  async function clearCaches(){
    if(!('caches' in window)) return 0;
    var keys=await caches.keys();
    await Promise.all(keys.map(function(k){return caches.delete(k)}));
    return keys.length;
  }
  async function unregisterWorkers(){
    if(!('serviceWorker' in navigator)) return 0;
    var regs=await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(function(r){return r.unregister()}));
    return regs.length;
  }
  function addButton(){
    var host=document.querySelector('.top .row.no-print');
    if(!host || document.getElementById('forceUpdateBtn')) return;
    var btn=document.createElement('button');
    btn.id='forceUpdateBtn';
    btn.textContent='Обновить приложение';
    btn.title='Очистить кэш интерфейса и загрузить свежую версию';
    btn.onclick=async function(){
      btn.disabled=true;
      try{
        var c=await clearCaches();
        var w=await unregisterWorkers();
        localStorage.setItem('leader_last_force_update', new Date().toISOString());
        toast('Кэш очищен: '+c+', service worker: '+w+'. Перезагрузка...');
        setTimeout(function(){ location.reload(true); }, 800);
      }catch(e){
        btn.disabled=false;
        alert('Не удалось обновить приложение: '+e.message);
      }
    };
    host.appendChild(btn);
  }
  function addVersionNote(){
    var auth=document.getElementById('auth');
    if(!auth || document.getElementById('appVersionNote')) return;
    var div=document.createElement('div');
    div.id='appVersionNote';
    div.className='muted';
    div.style.marginTop='6px';
    div.textContent='Версия интерфейса: 2026-05-17. Если не видны новые вкладки, нажмите «Обновить приложение».';
    auth.appendChild(div);
  }
  window.LeaderUpdateTools={
    clearCaches: clearCaches,
    unregisterWorkers: unregisterWorkers,
    hardReload: async function(){ await clearCaches(); await unregisterWorkers(); location.reload(true); }
  };
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){ addButton(); addVersionNote(); }, 800);
  });
})();
