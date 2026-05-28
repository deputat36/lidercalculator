(function(){
  if(window.__leaderFetchTimeoutPatched)return;
  window.__leaderFetchTimeoutPatched=true;
  var originalFetch=window.fetch;
  if(typeof originalFetch!=='function')return;
  window.fetch=function(input,init){
    init=init||{};
    var timeoutMs=Number(init.timeoutMs||window.LEADER_FETCH_TIMEOUT_MS||18000);
    if(!window.AbortController||init.signal){
      return originalFetch(input,init);
    }
    var controller=new AbortController();
    var timer=setTimeout(function(){try{controller.abort()}catch(e){}},timeoutMs);
    var next=Object.assign({},init,{signal:controller.signal});
    return originalFetch(input,next).catch(function(err){
      if(err&&err.name==='AbortError'){
        throw new Error('Сервер Supabase не ответил за '+Math.round(timeoutMs/1000)+' секунд. Проверьте интернет или откройте CRM заново.');
      }
      throw err;
    }).finally(function(){clearTimeout(timer)});
  };
})();
