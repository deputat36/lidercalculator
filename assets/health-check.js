// Diagnostics module for RA Lider CRM.
(function(){
  function el(id){return document.getElementById(id)}
  function row(name, status, details){
    var cls = status === 'OK' ? 'good' : (status === 'WARN' ? 'warn' : 'bad');
    return '<tr><td>'+escapeHtml(name)+'</td><td class="'+cls+'">'+escapeHtml(status)+'</td><td>'+escapeHtml(details||'')+'</td></tr>';
  }
  function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
  function db(){return window.db || null}
  function loadExtraModules(){
    if(!document.querySelector('script[src="assets/export-tools.js"]')){
      var s=document.createElement('script');
      s.src='assets/export-tools.js';
      document.body.appendChild(s);
    }
  }
  function addTab(){
    if(document.querySelector('[data-tab="diagnostics"]')) return;
    var tabs=document.querySelector('.tabs');
    if(!tabs) return;
    var tab=document.createElement('div');
    tab.className='tab';
    tab.dataset.tab='diagnostics';
    tab.textContent='Диагностика';
    tabs.appendChild(tab);
    var wrap=document.querySelector('.wrap');
    var sec=document.createElement('section');
    sec.id='diagnostics';
    sec.className='page hidden';
    sec.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><b>Диагностика системы</b><button onclick="LeaderHealthCheck.run()">Проверить</button></div><p class="muted">Проверяет вход, Supabase, таблицы, localStorage, service worker и PWA.</p><div class="table"><table><thead><tr><th>Проверка</th><th>Статус</th><th>Подробности</th></tr></thead><tbody id="healthRows"><tr><td colspan="3">Нажмите «Проверить»</td></tr></tbody></table></div></div>';
    wrap.appendChild(sec);
    tab.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden')};
  }
  async function checkTable(table){
    var client=db();
    if(!client) return {status:'ERR', details:'Supabase client не создан'};
    var res=await client.from(table).select('*').limit(1);
    if(res.error) return {status:'ERR', details:res.error.message};
    return {status:'OK', details:'доступ есть'};
  }
  window.LeaderHealthCheck={
    async run(){
      var out=[];
      var body=el('healthRows');
      if(!body) return;
      body.innerHTML='<tr><td colspan="3">Проверяю...</td></tr>';
      try{
        out.push(row('JavaScript', 'OK', 'модули загружены'));
        out.push(row('localStorage', window.localStorage ? 'OK' : 'ERR', window.localStorage ? 'доступен' : 'недоступен'));
        out.push(row('Service Worker', 'serviceWorker' in navigator ? 'OK' : 'WARN', 'serviceWorker' in navigator ? 'поддерживается' : 'не поддерживается браузером'));
        out.push(row('PWA manifest', document.querySelector('link[rel="manifest"]') ? 'OK' : 'WARN', document.querySelector('link[rel="manifest"]') ? 'подключен' : 'не найден'));
        out.push(row('Export tools', window.LeaderExports ? 'OK' : 'WARN', window.LeaderExports ? 'модуль экспорта подключен' : 'модуль ещё загружается'));
        var client=db();
        out.push(row('Supabase client', client ? 'OK' : 'ERR', client ? 'создан' : 'не создан'));
        if(client){
          var userRes=await client.auth.getUser();
          var user=userRes && userRes.data ? userRes.data.user : null;
          out.push(row('Авторизация', user ? 'OK' : 'WARN', user ? user.email : 'вход не выполнен'));
          if(user){
            var tables=['leader_orders','leader_clients','leader_leads','leader_catalog','leader_tasks','leader_user_profiles'];
            for(var i=0;i<tables.length;i++){
              var r=await checkTable(tables[i]);
              out.push(row('Таблица '+tables[i], r.status, r.details));
            }
          }
        }
        body.innerHTML=out.join('');
      }catch(e){
        out.push(row('Ошибка диагностики','ERR',e.message));
        body.innerHTML=out.join('');
      }
    }
  };
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){addTab();loadExtraModules();},700)});
})();
