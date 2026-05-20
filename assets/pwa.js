(function(){
  function loadScript(src){
    if(!document.querySelector('script[src="'+src+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }

  function showInstallButton(promptEvent){
    var host = document.querySelector('.top .row.no-print');
    if (!host || document.getElementById('installPwaBtn')) return;
    var btn = document.createElement('button');
    btn.id = 'installPwaBtn';
    btn.textContent = 'Установить приложение';
    btn.onclick = async function(){
      btn.disabled = true;
      promptEvent.prompt();
      try { await promptEvent.userChoice; } catch(e) {}
      btn.remove();
    };
    host.appendChild(btn);
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

  document.addEventListener('DOMContentLoaded', function(){
    loadScript('assets/auth-status.js');
  });
})();
