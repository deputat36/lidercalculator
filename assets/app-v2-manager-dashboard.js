(function(){
  var data={leads:[],orders:[],design:[],production:[],installation:[]};
  var loaded=false, loading=false;
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function d(v){try{return v?new Date(v).toLocaleDateString('ru-RU'):'—'}catch(x){return v||'—'}}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(x){return v||'—'}}
  function todayStart(){var x=new Date();x.setHours(0,0,0,0);return x}
  function tomorrowStart(){var x=todayStart();x.setDate(x.getDate()+1);return x}
  function isPast(v){return v&&new Date(v).getTime()<Date.now()}
  function isToday(v){if(!v)return false;var t=new Date(v).getTime();return t>=todayStart().getTime()&&t<tomorrowStart().getTime()}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('managerDashboardCss'))return;
    var s=document.createElement('style');s.id='managerDashboardCss';s.textContent='.manager-dashboard{margin-top:14px}.manager-dashboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}.manager-dashboard-head h2{margin:0}.manager-dashboard-head p{margin:4px 0 0;color:var(--muted);font-size:13px;line-height:1.4}.manager-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.manager-col{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}.manager-col-head{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f9fafb;border-bottom:1px solid var(--line);padding:10px}.manager-col-title{font-weight:900}.manager-col-count{border-radius:999px;background:#111827;color:#fff;font-size:12px;font-weight:900;padding:4px 8px}.manager-list{display:grid;gap:8px;padding:10px}.manager-item{border:1px solid var(--line);border-radius:12px;padding:9px;background:#fff}.manager-item.bad{border-color:#fecaca;background:#fef2f2}.manager-item.warn{border-color:#fde68a;background:#fffbeb}.manager-item.good{border-color:#bbf7d0;background:#f0fdf4}.manager-item-title{font-weight:900;font-size:13px;line-height:1.35}.manager-item-meta{color:#6b7280;font-size:12px;line-height:1.4;margin-top:4px}.manager-item-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.manager-item-actions button,.manager-item-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:900;cursor:pointer;text-decoration:none;color:#111827}.manager-empty{padding:12px;color:#6b7280;font-size:13px}.manager-kpi{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}.manager-kpi>div{border:1px solid var(--line);background:#f9fafb;border-radius:12px;padding:10px}.manager-kpi span{display:block;color:#6b7280;font-size:11px;font-weight:900;margin-bottom:4px}.manager-kpi b{font-size:15px}.manager-version{font-size:12px;color:#6b7280;margin-top:8px}@media(max-width:1060px){.manager-board{grid-template-columns:1fr 1fr}.manager-kpi{grid-template-columns:1fr 1fr}}@media(max-width:620px){.manager-board,.manager-kpi{grid-template-columns:1fr}.manager-item-actions button,.manager-item-actions a{flex:1}}';document.head.appendChild(s)
  }
  function ensure(){
    css();
    if(e('managerDashboard'))return;
    var dash=e('dashboard');
    if(!dash)return;
    var host=document.createElement('div');
    host.id='managerDashboard';
    host.className='card manager-dashboard';
    host.innerHTML='<div class="manager-dashboard-head"><div><h2>Рабочий стол менеджера</h2><p>Очереди действий: что требует внимания сегодня и что может сорвать заказ.</p><div class="manager-version">Сценарий: заявка → расчёт → заказ → дизайн → производство → монтаж → оплата → закрытие.</div></div><div class="actions"><button id="managerDashReload" class="primary">Обновить рабочий стол</button></div></div><div class="manager-kpi"><div><span>Новые заявки</span><b id="mkLeads">0</b></div><div><span>Без предоплаты</span><b id="mkNoPay">0</b></div><div><span>Просрочки</span><b id="mkOverdue">0</b></div><div><span>Долги</span><b id="mkDebt">0 ₽</b></div><div><span>Монтаж сегодня</span><b id="mkInstallToday">0</b></div></div><div id="managerBoard" class="manager-board"></div>';
    var today=e('todayList');
    if(today&&today.parentNode)today.parentNode.appendChild(host);else dash.appendChild(host);
    var r=e('managerDashReload');if(r)r.onclick=function(){loaded=false;load(true)};
  }
  async function load(force){
    if(loading)return;
    if(loaded&&!force)return render();
    loading=true;ensure();
    var board=e('managerBoard');if(board)board.innerHTML='<div class="manager-empty">Загружаю рабочий стол...</div>';
    try{
      await needLogin();
      var lr=await window.db.from('leader_leads').select('*').order('created_at',{ascending:false}).limit(80);
      var or=await window.db.from('leader_orders').select('*').order('created_at',{ascending:false}).limit(160);
      var dr=await window.db.from('leader_design_tasks').select('*').order('created_at',{ascending:false}).limit(120);
      var pr=await window.db.from('leader_production_jobs').select('*').order('created_at',{ascending:false}).limit(120);
      var ir=await window.db.from('leader_installation_jobs').select('*').order('created_at',{ascending:false}).limit(120);
      data.leads=lr.error?[]:(lr.data||[]);
      data.orders=or.error?[]:(or.data||[]);
      data.design=dr.error?[]:(dr.data||[]);
      data.production=pr.error?[]:(pr.data||[]);
      data.installation=ir.error?[]:(ir.data||[]);
      loaded=true;render();
    }catch(err){if(board)board.innerHTML='<div class="manager-empty" style="color:#991b1b">Не удалось загрузить рабочий стол: '+h(err.message||err)+'</div>'}
    finally{loading=false}
  }
  function leadNeedsContact(l){
    var st=l.status||'';
    if(['Создан заказ','Отказ','Передумал','Дорого','Спам'].indexOf(st)>=0)return false;
    if(!l.last_contact_at&&['Новая','В работе','Уточнение деталей','Ждём ответ'].indexOf(st)>=0)return true;
    if(l.next_contact_at&&isPast(l.next_contact_at))return true;
    return false;
  }
  function orderActive(o){return ['Новый','Согласовано','Передано подрядчику','В работе','Готов'].indexOf(o.status||'')>=0}
  function orderNoPay(o){return orderActive(o)&&n(o.client_total)>0&&n(o.prepayment)<=0&&['Не оплачено',null,''].indexOf(o.payment_status)==-1?false:orderActive(o)&&n(o.client_total)>0&&n(o.prepayment)<=0&&o.payment_status!=='Оплачено полностью'}
  function orderDebt(o){return orderActive(o)&&n(o.balance)>0}
  function orderNoNext(o){return orderActive(o)&&(!o.next_action||!o.current_stage||n(o.progress_percent)<=0)}
  function designAttention(t){return ['Новая','В работе','На согласовании','Правки'].indexOf(t.task_status||'')>=0}
  function productionAttention(j){return ['Не передано','Передан подрядчику','В работе','Монтаж назначен'].indexOf(j.production_status||'')>=0}
  function installationAttention(j){return ['Нужно назначить','Назначен','Монтажник получил ТЗ','В пути','Выполняется','Проблема'].indexOf(j.install_status||'')>=0}
  function openTab(page){var b=document.querySelector('[data-page="'+page+'"]');if(b)b.click();}
  function callBtn(phone){return phone?'<a href="tel:'+h(phone)+'">Позвонить</a>':''}
  function maxBtn(phone){return phone?'<button data-manager-copy-phone="'+h(String(phone).replace(/[^0-9]/g,''))+'">MAX</button>':''}
  function item(title,meta,kind,actions){return '<div class="manager-item '+(kind||'')+'"><div class="manager-item-title">'+h(title)+'</div><div class="manager-item-meta">'+meta+'</div><div class="manager-item-actions">'+(actions||'')+'</div></div>'}
  function col(title,items){return '<section class="manager-col"><div class="manager-col-head"><div class="manager-col-title">'+h(title)+'</div><div class="manager-col-count">'+items.length+'</div></div><div class="manager-list">'+(items.length?items.join(''):'<div class="manager-empty">Пока пусто</div>')+'</div></section>'}
  function render(){
    ensure();
    var leads=data.leads.filter(leadNeedsContact).slice(0,8).map(function(l){return item(l.client_name||'Заявка без имени','Телефон: '+h(l.client_phone||'—')+'<br>Услуга: '+h(l.service||l.message||'—')+'<br>Статус: '+h(l.status||'—'),l.next_contact_at&&isPast(l.next_contact_at)?'bad':'warn',callBtn(l.client_phone)+maxBtn(l.client_phone)+'<button data-manager-tab="leads">Открыть заявки</button>')});
    var noPay=data.orders.filter(orderNoPay).slice(0,8).map(function(o){return item(o.project_name||('Заказ '+String(o.id).slice(0,8)),'Сумма: '+money(o.client_total)+'<br>Оплата: '+h(o.payment_status||'не указана')+'<br>Следующий шаг: '+h(o.next_action||'не рассчитан'),'bad',callBtn(o.client_phone)+maxBtn(o.client_phone)+'<button data-manager-tab="orders">Открыть заказы</button>')});
    var design=data.design.filter(designAttention).slice(0,8).map(function(t){var bad=t.deadline&&isPast(t.deadline);return item(t.title||'Дизайн-задача','Клиент: '+h(t.client_name||'—')+'<br>Статус: '+h(t.task_status||'—')+' / '+h(t.layout_status||'—')+'<br>Срок: '+h(t.deadline?dt(t.deadline):'не указан'),bad?'bad':'warn','<button data-manager-tab="design">Открыть дизайн</button>')});
    var production=data.production.filter(productionAttention).slice(0,8).map(function(j){var bad=j.deadline&&isPast(j.deadline);return item(j.title||'Производство','Подрядчик: '+h(j.contractor_name||'—')+'<br>Статус: '+h(j.production_status||'—')+'<br>Срок: '+h(j.deadline?dt(j.deadline):'не указан'),bad?'bad':'warn','<button data-manager-tab="production">Открыть производство</button>')});
    var installation=data.installation.filter(installationAttention).slice(0,8).map(function(j){var bad=j.scheduled_at&&isPast(j.scheduled_at)&&['Выполнен','Клиент принял','Закрыт'].indexOf(j.install_status)<0;return item(j.title||'Монтаж','Адрес: '+h(j.address||'—')+'<br>Монтажник: '+h(j.installer_name||'—')+'<br>Дата: '+h(j.scheduled_at?dt(j.scheduled_at):'не назначена'),bad?'bad':(isToday(j.scheduled_at)?'good':'warn'),callBtn(j.installer_phone)+'<button data-manager-tab="installation">Открыть монтаж</button>')});
    var debts=data.orders.filter(orderDebt).slice(0,8).map(function(o){return item(o.project_name||('Заказ '+String(o.id).slice(0,8)),'Остаток: '+money(o.balance)+'<br>Сумма: '+money(o.client_total)+'<br>Статус: '+h(o.status||'—'),'bad',callBtn(o.client_phone)+maxBtn(o.client_phone)+'<button data-manager-tab="orders">Открыть заказы</button>')});
    var noNext=data.orders.filter(orderNoNext).slice(0,8).map(function(o){return item(o.project_name||('Заказ '+String(o.id).slice(0,8)),'Этап: '+h(o.current_stage||'не рассчитан')+'<br>Готовность: '+h(o.progress_percent||0)+'%<br>Создан: '+h(d(o.created_at)),'warn','<button data-manager-tab="orders">Открыть и пересчитать</button>')});
    var overdueCount=data.design.filter(function(t){return t.deadline&&isPast(t.deadline)&&['Готова','Согласована','Передана в производство','Отменена'].indexOf(t.task_status)<0}).length+data.production.filter(function(j){return j.deadline&&isPast(j.deadline)&&['Готов','Получен','Выдан клиенту','Монтаж выполнен','Отменён'].indexOf(j.production_status)<0}).length+data.installation.filter(function(j){return j.scheduled_at&&isPast(j.scheduled_at)&&['Выполнен','Клиент принял','Закрыт','Отменён'].indexOf(j.install_status)<0}).length;
    if(e('mkLeads'))e('mkLeads').textContent=leads.length;
    if(e('mkNoPay'))e('mkNoPay').textContent=noPay.length;
    if(e('mkOverdue'))e('mkOverdue').textContent=overdueCount;
    if(e('mkDebt'))e('mkDebt').textContent=money(data.orders.reduce(function(a,o){return a+n(o.balance)},0));
    if(e('mkInstallToday'))e('mkInstallToday').textContent=data.installation.filter(function(j){return isToday(j.scheduled_at)}).length;
    var board=e('managerBoard');
    if(board)board.innerHTML=col('Заявки: нужен контакт',leads)+col('Заказы: нет предоплаты',noPay)+col('Дизайн: в работе / правки',design)+col('Производство: контроль',production)+col('Монтаж: назначить / выполнить',installation)+col('Долги и остатки',debts)+col('Без следующего шага',noNext);
  }
  function bind(){
    document.addEventListener('click',function(ev){
      var tab=ev.target.closest('[data-manager-tab]');
      if(tab){openTab(tab.dataset.managerTab);return}
      var phone=ev.target.closest('[data-manager-copy-phone]');
      if(phone){var p=phone.dataset.managerCopyPhone||'';if(p&&navigator.clipboard)navigator.clipboard.writeText(p).catch(function(){});window.open('https://web.max.ru/','_blank','noopener');toast('Номер скопирован для MAX')}
    });
  }
  function boot(){ensure();bind();load(false);document.querySelectorAll('[data-page="dashboard"]').forEach(function(b){if(!b.dataset.managerDash){b.dataset.managerDash='1';b.addEventListener('click',function(){setTimeout(function(){load(false)},300)})}})}
  window.LeaderV2ManagerDashboard={load:load,render:render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1400)});else setTimeout(boot,1000);
})();
