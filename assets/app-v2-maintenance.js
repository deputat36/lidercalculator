(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function css(){
    if(e('leaderMaintenanceCss'))return;
    var s=document.createElement('style');s.id='leaderMaintenanceCss';s.textContent='.maintenance-box{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.maintenance-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.maintenance-title{font-weight:900;font-size:15px}.maintenance-sub{font-size:12px;color:#6b7280;line-height:1.4;margin-top:3px}.maintenance-actions{display:flex;gap:7px;flex-wrap:wrap}.maintenance-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 10px;font-size:12px;font-weight:900;cursor:pointer}.maintenance-actions .primary{background:#111827;color:#fff}.maintenance-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:10px}.maintenance-card{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:9px}.maintenance-card span{display:block;font-size:11px;font-weight:900;color:#6b7280;margin-bottom:4px}.maintenance-card b{font-size:15px}.maintenance-warn{margin-top:8px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:8px;font-size:12px;line-height:1.4}.maintenance-table{width:100%;border-collapse:collapse;margin-top:10px}.maintenance-table th,.maintenance-table td{padding:7px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.maintenance-table th{font-size:12px;color:#6b7280;font-weight:900}@media(max-width:960px){.maintenance-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.maintenance-grid{grid-template-columns:1fr}.maintenance-actions button{flex:1}.maintenance-table thead{display:none}.maintenance-table,.maintenance-table tbody,.maintenance-table tr,.maintenance-table td{display:block;width:100%}.maintenance-table tr{border:1px solid var(--line);border-radius:12px;margin:8px 0;padding:7px}.maintenance-table td{border:0;padding:5px 0}}';document.head.appendChild(s)
  }
  async function need(){if(!window.db)throw new Error('Supabase ещё не готов');var s=await window.db.auth.getSession();if(!s.data||!s.data.session)throw new Error('Сначала войдите в CRM')}
  function calcStage(o){
    var client=n(o.client_total), paid=n(o.prepayment), balance=Math.max(0,client-paid);
    var stage='Согласование запуска', action='Передать заказ в производство / создать задачи', pct=15;
    if(o.is_archived){return {current_stage:'Архив',next_action:'Не требуется',progress_percent:100,balance:balance,profit:client-n(o.contractor_cost),payment_status:o.payment_status||'Архив'}}
    if(client<=0){stage='Нужен расчёт';action='Исправить сумму клиенту и пересчитать заказ';pct=5}
    else if(['Выдан','Закрыт'].indexOf(o.status)>=0||o.issued_at||o.completed_at){stage='Закрытие';action='Проверить оплату и закрывающие комментарии';pct=100}
    else if(o.installation_completed_at||['Выполнен','Клиент принял','Закрыт'].indexOf(o.installation_status)>=0){stage='Монтаж выполнен';action=balance>0?'Получить остаток оплаты':'Закрыть заказ';pct=90}
    else if(o.installation_scheduled_at||['Назначен','В работе','Запланирован'].indexOf(o.installation_status)>=0){stage='Монтаж';action='Проконтролировать монтаж';pct=80}
    else if(['Готов','Получен','Готово','Выдан клиенту'].indexOf(o.production_status)>=0||o.ready_at){stage='Готовность / выдача';action=balance>0?'Получить доплату перед выдачей':'Выдать заказ клиенту';pct=70}
    else if(['Передано','В работе','На производстве'].indexOf(o.production_status)>=0||o.sent_to_contractor_at){stage='Производство';action='Проконтролировать готовность производства';pct=55}
    else if(['Нужен дизайн','Макета нет','Макет плохого качества'].indexOf(o.layout_status)>=0){stage='Макет / дизайн';action='Поставить задачу дизайнеру и согласовать макет';pct=25}
    else if(['В работе у дизайнера','На согласовании'].indexOf(o.layout_status)>=0){stage='Макет / дизайн';action='Довести макет до согласования';pct=25}
    else if(paid>0){stage='Согласование запуска';action='Передать заказ в производство / создать задачи';pct=35}
    else {stage='Согласование запуска';action='Получить предоплату или согласовать запуск без предоплаты';pct=15}
    var ps=client<=0?'Требует проверки':(balance<=0?'Оплачено полностью':(paid>0?'Предоплата':'Не оплачено'));
    return {current_stage:stage,next_action:action,progress_percent:pct,balance:balance,profit:client-n(o.contractor_cost),payment_status:ps}
  }
  async function load(){
    await need();
    var r=await window.db.from('leader_orders').select('id,project_name,status,client_total,contractor_cost,profit,prepayment,balance,payment_status,current_stage,next_action,progress_percent,is_archived,archived_reason,created_at').order('created_at',{ascending:false});
    if(r.error)throw new Error(r.error.message);
    var orders=r.data||[];
    var active=orders.filter(function(o){return !o.is_archived});
    var archived=orders.filter(function(o){return o.is_archived});
    return {orders:orders,active:active,archived:archived,zero:active.filter(function(o){return n(o.client_total)<=0}),debt:active.filter(function(o){return n(o.balance)>0}),noProgress:active.filter(function(o){return !o.current_stage||!o.next_action||n(o.progress_percent)<=0})}
  }
  function render(container,data){
    var rows=data.active.slice(0,8).map(function(o){return '<tr><td>'+h(o.project_name||'Заказ')+'</td><td>'+h(o.status||'')+'</td><td>'+h(o.current_stage||'—')+'</td><td>'+h(o.next_action||'—')+'</td><td>'+money(o.client_total)+'</td><td>'+money(o.balance)+'</td></tr>'}).join('')||'<tr><td colspan="6">Активных заказов нет.</td></tr>';
    var warn=[];
    if(data.zero.length)warn.push('Есть активные заказы с нулевой суммой клиенту: '+data.zero.length+'. Их нужно исправить вручную или архивировать.');
    if(data.noProgress.length)warn.push('Есть заказы без этапа/следующего действия: '+data.noProgress.length+'. Нажмите «Пересчитать этапы».');
    if(!data.orders.length)warn.push('Заказов пока нет.');
    container.innerHTML='<div class="maintenance-head"><div><div class="maintenance-title">Обслуживание CRM</div><div class="maintenance-sub">Контроль чистоты данных: архив тестов, этапы заказов, долги и проблемные суммы.</div></div><div class="maintenance-actions"><button class="primary" data-maint="refresh">Обновить</button><button data-maint="recalc">Пересчитать этапы</button><button data-maint="archive-tests">Архивировать тестовые</button><a class="btn" href="app-v2-audit-v2.html" target="_blank">Аудит v2</a></div></div><div class="maintenance-grid"><div class="maintenance-card"><span>Всего заказов</span><b>'+data.orders.length+'</b></div><div class="maintenance-card"><span>Активных</span><b>'+data.active.length+'</b></div><div class="maintenance-card"><span>В архиве</span><b>'+data.archived.length+'</b></div><div class="maintenance-card"><span>С долгом</span><b>'+data.debt.length+'</b></div><div class="maintenance-card"><span>Нулевая сумма</span><b>'+data.zero.length+'</b></div><div class="maintenance-card"><span>Без этапа</span><b>'+data.noProgress.length+'</b></div></div>'+(warn.length?'<div class="maintenance-warn">'+warn.map(h).join('<br>')+'</div>':'')+'<table class="maintenance-table"><thead><tr><th>Заказ</th><th>Статус</th><th>Этап</th><th>Следующее действие</th><th>Сумма</th><th>Остаток</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  async function refresh(){css();var dash=e('dashboard');if(!dash)return;var box=e('maintenanceBox');if(!box){box=document.createElement('div');box.id='maintenanceBox';box.className='maintenance-box';var first=dash.querySelector('.card');if(first)first.insertAdjacentElement('afterend',box);else dash.appendChild(box)}box.textContent='Проверяю данные CRM...';try{render(box,await load())}catch(err){box.innerHTML='<div class="maintenance-warn">Ошибка обслуживания CRM: '+h(err.message||err)+'</div>'}}
  async function recalc(){
    await need();
    var r=await window.db.from('leader_orders').select('*').eq('is_archived',false);
    if(r.error)throw new Error(r.error.message);
    var orders=r.data||[], done=0;
    for(var i=0;i<orders.length;i++){
      var patch=calcStage(orders[i]);patch.stage_updated_at=new Date().toISOString();patch.updated_at=new Date().toISOString();
      var u=await window.db.from('leader_orders').update(patch).eq('id',orders[i].id);
      if(!u.error)done++;
    }
    alert('Этапы пересчитаны: '+done+' заказов.');
    await refresh();
    if(window.LeaderV2ManagerDashboard&&window.LeaderV2ManagerDashboard.load)window.LeaderV2ManagerDashboard.load(true).catch(function(){});
  }
  async function archiveTests(){
    await need();
    var r=await window.db.from('leader_orders').select('id,project_name').eq('is_archived',false);
    if(r.error)throw new Error(r.error.message);
    var tests=(r.data||[]).filter(function(o){return /test|delete|тест|удалить/i.test(o.project_name||'')});
    if(!tests.length){alert('Тестовых активных заказов не найдено.');return}
    if(!confirm('Архивировать тестовые заказы: '+tests.length+'? Данные не удаляются.'))return;
    var ids=tests.map(function(o){return o.id});
    var u=await window.db.from('leader_orders').update({is_archived:true,archived_at:new Date().toISOString(),archived_reason:'Архивировано из обслуживания CRM',current_stage:'Архив',next_action:'Не требуется',progress_percent:100,updated_at:new Date().toISOString()}).in('id',ids);
    if(u.error)throw new Error(u.error.message);
    await refresh();
  }
  function boot(){css();setTimeout(refresh,1200);document.addEventListener('click',function(ev){var b=ev.target.closest('[data-maint]');if(!b)return;var a=b.dataset.maint;if(a==='refresh')refresh();if(a==='recalc')recalc().catch(function(err){alert(err.message||err)});if(a==='archive-tests')archiveTests().catch(function(err){alert(err.message||err)});});}
  window.LeaderV2Maintenance={refresh:refresh,recalc:recalc,archiveTests:archiveTests};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
