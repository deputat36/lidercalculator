// Diagnostics module for RA Lider CRM.
(function(){
  function el(id){return document.getElementById(id)}
  function row(name, status, details){
    var cls = status === 'OK' ? 'good' : (status === 'WARN' ? 'warn' : 'bad');
    return '<tr><td>'+escapeHtml(name)+'</td><td class="'+cls+'">'+escapeHtml(status)+'</td><td>'+escapeHtml(details||'')+'</td></tr>';
  }
  function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function db(){return window.db || null}
  function loadScript(src){
    if(!document.querySelector('script[src="'+src+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }
  function loadCss(href){
    if(!document.querySelector('link[href="'+href+'"]')){
      var l=document.createElement('link');
      l.rel='stylesheet';
      l.href=href;
      document.head.appendChild(l);
    }
  }
  function loadExtraModules(){
    loadScript('assets/auth-repair.js');
    loadCss('assets/user-admin.css');
    loadScript('assets/user-admin.js');
    loadCss('assets/role-guard.css');
    loadScript('assets/role-guard.js');
    loadCss('assets/leads-fix.css');
    loadScript('assets/leads-fix.js');
    loadScript('assets/leads-table-fix.js');
    loadScript('assets/export-tools.js');
    loadScript('assets/update-tools.js');
    loadCss('assets/client-card.css');
    loadScript('assets/client-card.js');
    loadCss('assets/lead-card.css');
    loadScript('assets/lead-card.js');
    loadCss('assets/lead-intake.css');
    loadScript('assets/lead-intake.js');
    loadCss('assets/workdesk.css');
    loadScript('assets/workdesk.js');
    loadCss('assets/templates.css');
    loadScript('assets/templates.js');
    loadCss('assets/production.css');
    loadScript('assets/production.js');
    loadCss('assets/production-safe.css');
    loadScript('assets/production-safe.js');
    loadCss('assets/finance.css');
    loadScript('assets/finance.js');
    loadCss('assets/notifications.css');
    loadScript('assets/notifications.js');
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
  async function checkView(view){
    var client=db();
    if(!client) return {status:'ERR', details:'Supabase client не создан'};
    var res=await client.from(view).select('*').limit(1);
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
        out.push(row('Auth repair', window.LeaderAuthRepair ? 'OK' : 'WARN', window.LeaderAuthRepair ? 'модуль сброса входа подключен' : 'модуль ещё загружается'));
        out.push(row('User admin', window.LeaderUserAdmin ? 'OK' : 'WARN', window.LeaderUserAdmin ? 'модуль управления пользователями подключен' : 'модуль ещё загружается'));
        out.push(row('Role guard', window.LeaderRoleGuard ? 'OK' : 'WARN', window.LeaderRoleGuard ? 'модуль ограничения ролей подключен' : 'модуль ещё загружается'));
        out.push(row('Leads repair', window.LeaderLeadsFix ? 'OK' : 'WARN', window.LeaderLeadsFix ? 'аварийная загрузка заявок подключена' : 'модуль ещё загружается'));
        out.push(row('Leads table fix', window.LeaderLeadsTableFix ? 'OK' : 'WARN', window.LeaderLeadsTableFix ? 'прямой вывод заявок подключен' : 'модуль ещё загружается'));
        out.push(row('Export tools', window.LeaderExports ? 'OK' : 'WARN', window.LeaderExports ? 'модуль экспорта подключен' : 'модуль ещё загружается'));
        out.push(row('Update tools', window.LeaderUpdateTools ? 'OK' : 'WARN', window.LeaderUpdateTools ? 'модуль обновления подключен' : 'модуль ещё загружается'));
        out.push(row('Client card', window.LeaderClientCard ? 'OK' : 'WARN', window.LeaderClientCard ? 'модуль карточки клиента подключен' : 'модуль ещё загружается'));
        out.push(row('Lead card', window.LeaderLeadCard ? 'OK' : 'WARN', window.LeaderLeadCard ? 'модуль карточки заявки подключен' : 'модуль ещё загружается'));
        out.push(row('Manual lead intake', window.LeaderLeadIntake ? 'OK' : 'WARN', window.LeaderLeadIntake ? 'модуль ручного добавления заявок подключен' : 'модуль ещё загружается'));
        out.push(row('Workdesk', window.LeaderWorkdesk ? 'OK' : 'WARN', window.LeaderWorkdesk ? 'рабочий стол подключен' : 'модуль ещё загружается'));
        out.push(row('Templates', window.LeaderTemplates ? 'OK' : 'WARN', window.LeaderTemplates ? 'модуль шаблонов подключен' : 'модуль ещё загружается'));
        out.push(row('Production', window.LeaderProduction ? 'OK' : 'WARN', window.LeaderProduction ? 'модуль производства подключен' : 'модуль ещё загружается'));
        out.push(row('Safe production', window.LeaderProductionSafe ? 'OK' : 'WARN', window.LeaderProductionSafe ? 'безопасный режим производства подключен' : 'модуль ещё загружается'));
        out.push(row('Finance', window.LeaderFinance ? 'OK' : 'WARN', window.LeaderFinance ? 'модуль финансов подключен' : 'модуль ещё загружается'));
        out.push(row('Notifications', window.LeaderNotifications ? 'OK' : 'WARN', window.LeaderNotifications ? 'центр уведомлений подключен' : 'модуль ещё загружается'));
        var client=db();
        out.push(row('Supabase client', client ? 'OK' : 'ERR', client ? 'создан' : 'не создан'));
        if(client){
          var userRes=await client.auth.getUser();
          var user=userRes && userRes.data ? userRes.data.user : null;
          out.push(row('Авторизация', user ? 'OK' : 'WARN', user ? user.email : 'вход не выполнен'));
          if(user){
            var tables=['leader_orders','leader_clients','leader_leads','leader_catalog','leader_tasks','leader_user_profiles','leader_user_activity','leader_role_permissions','leader_client_interactions','leader_lead_events','leader_calculation_templates','leader_message_templates','leader_contractors','leader_production_jobs','leader_production_job_items','leader_production_events','leader_expenses','leader_finance_notes','leader_notification_preferences'];
            for(var i=0;i<tables.length;i++){
              var r=await checkTable(tables[i]);
              out.push(row('Таблица '+tables[i], r.status, r.details));
            }
            var sv=await checkView('leader_production_safe_summary');
            out.push(row('View leader_production_safe_summary', sv.status, sv.details));
            var lr=await checkTable('leader_leads');
            out.push(row('RLS leader_leads', lr.status, lr.details));
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