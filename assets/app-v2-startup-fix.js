(function(){
  function wait(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  function text(err){ return err && err.message ? err.message : String(err || 'Ошибка'); }
  function install(){
    if (window.__leaderStartupFix) return;
    window.__leaderStartupFix = true;
    if (typeof loadCrmData !== 'function') return;
    loadCrmData = async function(){
      var leadsOk = false;
      try { if (typeof setAuth === 'function') setAuth('Вход выполнен. Загружаю заявки...', true); } catch(e){}
      for (var i = 0; i < 3; i++) {
        try {
          await loadLeads();
          leadsOk = true;
          break;
        } catch(err) {
          console.warn('Leads loading retry', i + 1, err);
          try { if (typeof setAuth === 'function') setAuth('Заявки не загрузились. Повторная попытка...', false); } catch(e){}
          await wait(1000 + i * 1000);
        }
      }
      try { if (typeof state !== 'undefined') state.leadsLoaded = leadsOk; } catch(e){}
      try { if (typeof setAuth === 'function') setAuth((leadsOk ? 'Заявки загружены. ' : 'Заявки пока не загрузились. ') + 'Загружаю заказы...', leadsOk); } catch(e){}
      try { if (window.LeaderV2Orders && window.LeaderV2Orders.load) await window.LeaderV2Orders.load(true); } catch(err2) { console.warn('Orders loading error', err2); try { if (typeof toast === 'function') toast('Заказы не загрузились: ' + text(err2)); } catch(e){} }
      try { if (window.LeaderV2Clients && window.LeaderV2Clients.load) await window.LeaderV2Clients.load(true); } catch(err3) { console.warn('Clients loading error', err3); }
      try { if (typeof state !== 'undefined') state.crmReady = true; } catch(e){}
      var email = 'пользователь';
      var role = '';
      try { if (state && state.user && state.user.email) email = state.user.email; if (state && state.profile && state.profile.role) role = ' • роль: ' + state.profile.role; } catch(e){}
      try { if (typeof setAuth === 'function') setAuth((leadsOk ? 'CRM готова: ' : 'CRM открыта, но заявки не загрузились: ') + email + role, leadsOk); } catch(e){}
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(install, 20); });
  else setTimeout(install, 20);
})();
