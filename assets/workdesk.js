// Workdesk dashboard for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function rub(v){ v=Number(v||0); return Math.round(v).toLocaleString('ru-RU')+' ₽'; }
  function fmtDate(v){ if(!v) return '—'; try{return new Date(v).toLocaleString('ru-RU')}catch(e){return v} }
  function day(v){ if(!v) return null; var d=new Date(v); return isNaN(d)?null:d; }
  function overdue(date){ var d=day(date); return d && d < new Date(); }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function addTab(){
    if(document.querySelector('[data-tab="workdesk"]')) return;
    var tabs=document.querySelector('.tabs'), wrap=document.querySelector('.wrap');
    if(!tabs||!wrap) return;
    var tab=document.createElement('div'); tab.className='tab'; tab.dataset.tab='workdesk'; tab.textContent='Рабочий стол';
    tabs.insertBefore(tab, tabs.firstChild);
    var sec=document.createElement('section'); sec.id='workdesk'; sec.className='page hidden';
    sec.innerHTML='<div class="wd-toolbar"><div><b>Рабочий стол</b><div class="muted">Новые заявки, задачи, долги и проблемные заказы в одном месте.</div></div><div class="row"><button onclick="LeaderWorkdesk.refresh()">Обновить</button><button onclick="syncDown && syncDown()">Загрузить облако</button><button onclick="document.querySelector(\'[data-tab=leads]\').click(); setTimeout(function(){ LeaderLeadIntake && LeaderLeadIntake.open(); },400)">Новая заявка</button></div></div><div id="wdKpis" class="wd-kpis"></div><div class="wd-wrap" style="margin-top:12px"><div class="wd-panel" style="grid-column:span 4"><b>Новые заявки</b><div id="wdLeads" class="wd-list" style="margin-top:10px"></div></div><div class="wd-panel" style="grid-column:span 4"><b>Задачи на сегодня / просроченные</b><div id="wdTasks" class="wd-list" style="margin-top:10px"></div></div><div class="wd-panel" style="grid-column:span 4"><b>Заказы требуют внимания</b><div id="wdOrders" class="wd-list" style="margin-top:10px"></div></div><div class="wd-panel" style="grid-column:span 6"><b>Долги по заказам</b><div id="wdDebts" class="wd-list" style="margin-top:10px"></div></div><div class="wd-panel" style="grid-column:span 6"><b>Быстрые действия</b><div class="wd-actions" style="margin-top:10px"><button onclick="document.querySelector(\'[data-tab=calc]\').click()">Открыть калькулятор</button><button onclick="document.querySelector(\'[data-tab=clients]\').click()">Клиенты</button><button onclick="document.querySelector(\'[data-tab=orders]\').click()">Заказы</button><button onclick="document.querySelector(\'[data-tab=exports]\')&&document.querySelector(\'[data-tab=exports]\').click()">Экспорт</button><button onclick="backup&&backup()">Резервная копия</button></div><p class="muted">Рабочий стол использует данные из локального кэша. Перед началом дня нажмите «Загрузить облако».</p></div></div>';
    var firstPage=document.querySelector('.page');
    wrap.insertBefore(sec, firstPage);
    tab.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden');LeaderWorkdesk.refresh();};
  }
  function leadCard(l,i){ return '<div class="wd-item"><b>'+esc(l.name||l.phone||'Заявка без имени')+'</b><div class="wd-meta">'+esc(l.phone||'')+' • '+esc(l.service||l.source||'')+' • '+fmtDate(l.created_at)+'</div><div>'+esc(String(l.message||'').slice(0,120))+'</div><div class="wd-actions"><button onclick="document.querySelector(\'[data-tab=leads]\').click(); setTimeout(function(){LeaderLeadCard&&LeaderLeadCard.open('+i+')},300)">Карточка</button><button onclick="document.querySelector(\'[data-tab=leads]\').click(); setTimeout(function(){LeaderLeadCard&&LeaderLeadCard.toCalc('+i+')},300)">В расчёт</button></div></div>'; }
  function taskCard(t,i){ var cls=overdue(t.due_at)?'wd-hot':'wd-warn'; return '<div class="wd-item"><b class="'+cls+'">'+esc(t.title||'Задача')+'</b><div class="wd-meta">'+fmtDate(t.due_at)+' • '+esc(t.status||'')+'</div><div>'+esc(String(t.description||'').slice(0,120))+'</div><div class="wd-actions"><button onclick="LeaderWorkdesk.doneTask('+i+')">Готово</button><button onclick="document.querySelector(\'[data-tab=tasks]\').click()">Все задачи</button></div></div>'; }
  function orderCard(o,i){ var cls=overdue(o.deadline)?'wd-hot':'wd-warn'; return '<div class="wd-item"><b>'+esc(o.project||'Заказ')+'</b><div class="wd-meta '+cls+'">Срок: '+esc(o.deadline||'—')+' • '+esc(o.status||'')+'</div><div>'+esc(o.client||'')+' '+esc(o.phone||'')+'</div><div class="wd-actions"><button onclick="document.querySelector(\'[data-tab=orders]\').click(); setTimeout(function(){LeaderOrderCard&&LeaderOrderCard.open('+i+')},300)">Карточка</button></div></div>'; }
  function debtCard(o,i){ return '<div class="wd-item"><b>'+esc(o.project||'Заказ')+'</b><div class="wd-meta">'+esc(o.client||'')+' • '+esc(o.phone||'')+'</div><div class="wd-warn">Остаток: '+rub(o.balance)+'</div><div class="wd-actions"><button onclick="document.querySelector(\'[data-tab=orders]\').click(); setTimeout(function(){LeaderOrderCard&&LeaderOrderCard.open('+i+')},300)">Оплата</button><button onclick="LeaderWorkdesk.copyDebt('+i+')">Сообщение</button></div></div>'; }
  function empty(text){ return '<div class="wd-empty">'+esc(text)+'</div>'; }
  window.LeaderWorkdesk={
    refresh:function(){
      var leads=read('leads',[]), tasks=read('tasks',[]), orders=read('orders',[]), clients=read('clients',[]);
      var newLeads=leads.filter(function(l){return !l.status || l.status==='Новая'}).slice(0,8);
      var activeTasks=tasks.filter(function(t){return !['Готово','Отменено'].includes(t.status||'') && (!t.due_at || overdue(t.due_at) || new Date(t.due_at).toDateString()===new Date().toDateString())}).slice(0,8);
      var attention=orders.filter(function(o){return !['Выдан','Оплачено','Отменён'].includes(o.status||'') && (overdue(o.deadline)||['Новый','КП отправлено','Согласовано'].includes(o.status||''))}).slice(0,8);
      var debts=orders.filter(function(o){return Number(o.balance||0)>0 && !['Отменён'].includes(o.status||'')}).sort(function(a,b){return Number(b.balance||0)-Number(a.balance||0)}).slice(0,10);
      var revenue=orders.reduce(function(a,o){return a+Number(o.total||0)},0), debt=orders.reduce(function(a,o){return a+Number(o.balance||0)},0), profit=orders.reduce(function(a,o){return a+Number(o.profit||0)},0);
      var k=document.getElementById('wdKpis'); if(k) k.innerHTML='<div class="wd-kpi"><span>Новые заявки</span><b>'+newLeads.length+'</b></div><div class="wd-kpi"><span>Активные задачи</span><b>'+activeTasks.length+'</b></div><div class="wd-kpi"><span>Заказы</span><b>'+orders.length+'</b></div><div class="wd-kpi"><span>Клиенты</span><b>'+clients.length+'</b></div><div class="wd-kpi"><span>Выручка</span><b>'+rub(revenue)+'</b></div><div class="wd-kpi"><span>Долги</span><b class="'+(debt>0?'wd-warn':'wd-good')+'">'+rub(debt)+'</b></div>';
      var e=document.getElementById('wdLeads'); if(e) e.innerHTML=newLeads.length?newLeads.map(leadCard).join(''):empty('Новых заявок нет');
      e=document.getElementById('wdTasks'); if(e) e.innerHTML=activeTasks.length?activeTasks.map(taskCard).join(''):empty('Срочных задач нет');
      e=document.getElementById('wdOrders'); if(e) e.innerHTML=attention.length?attention.map(orderCard).join(''):empty('Проблемных заказов нет');
      e=document.getElementById('wdDebts'); if(e) e.innerHTML=debts.length?debts.map(debtCard).join(''):empty('Долгов нет');
    },
    doneTask:function(index){ var tasks=read('tasks',[]); if(tasks[index]){ tasks[index].status='Готово'; write('tasks',tasks); toast('Задача закрыта'); this.refresh(); if(window.renderTasks) window.renderTasks(); }},
    copyDebt:function(index){ var o=read('orders',[])[index]; if(!o) return; var text='Здравствуйте! Напоминаем по заказу «'+(o.project||'')+'». Остаток к оплате: '+rub(o.balance)+'.'; navigator.clipboard.writeText(text); toast('Сообщение по долгу скопировано'); }
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){addTab(); LeaderWorkdesk.refresh();},900); });
})();
