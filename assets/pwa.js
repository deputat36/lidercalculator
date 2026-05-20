(function(){
  function loadScript(src){
    if(!document.querySelector('script[src="'+src+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }

  function host(){
    return document.querySelector('.top .row.no-print') || document.querySelector('#auth .row .row') || document.body;
  }

  function toast(msg){
    var t=document.getElementById('toast');
    if(t){
      t.textContent=msg;
      t.classList.add('show');
      setTimeout(function(){t.classList.remove('show')},2200);
    } else alert(msg);
  }

  async function hardUpdate(){
    try{
      if('serviceWorker' in navigator){
        var regs=await navigator.serviceWorker.getRegistrations();
        for(var i=0;i<regs.length;i++) await regs[i].unregister();
      }
      if(window.caches){
        var keys=await caches.keys();
        for(var j=0;j<keys.length;j++) await caches.delete(keys[j]);
      }
    }catch(e){ console.warn(e); }
    toast('Приложение обновляется...');
    setTimeout(function(){ location.reload(true); },600);
  }

  function showUpdateButton(){
    var h=host();
    if(!h || document.getElementById('forceUpdateAppBtn')) return;
    var btn=document.createElement('button');
    btn.id='forceUpdateAppBtn';
    btn.textContent='Обновить приложение';
    btn.title='Очистить кеш приложения и загрузить свежую версию';
    btn.onclick=hardUpdate;
    h.appendChild(btn);
  }

  function showInstallButton(promptEvent){
    var h = host();
    if (!h || document.getElementById('installPwaBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'installPwaBtn';
    btn.textContent = 'Установить приложение';
    btn.onclick = async function(){
      btn.disabled = true;
      promptEvent.prompt();
      try { await promptEvent.userChoice; } catch(e) {}
      btn.remove();
    };
    h.appendChild(btn);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').catch(function(err){ console.warn('SW registration failed', err); });
    });
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    showInstallButton(e);
  });

  window.LeaderPWA={hardUpdate:hardUpdate,showUpdateButton:showUpdateButton};

  document.addEventListener('DOMContentLoaded', function(){
    loadScript('assets/auth-fast.js');
    loadScript('assets/auth-status.js');
    showUpdateButton();
    setInterval(showUpdateButton,2500);
  });
})();
