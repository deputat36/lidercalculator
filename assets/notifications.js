// Notifications center for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function rub(v){ v=Number(v||0); return Math.round(v).toLocaleString('ru-RU')+' ₽'; }
  function db(){ return window.db || null; }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ console.log(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function d(v){ if(!v) return null; var x=new Date(v); return isNaN(x)?null:x; }
  function dueSoon(v, hours){ var x=d(v); if(!x) return false; var now=new Date(); return x>=now && x-now <= hours*3600000; }
  function overdue(v){ var x=d(v); return x && x < new Date(); }
  function settings(){ return Object.assign({browser:false,newLeads:true,tasks:true,orders:true,production:true,debts:true}, read('notification_settings', {})); }
  function saveSettings(s){ write('notification_settings', s); }
  function build(){
    var s=settings(), out=[];
    if(s.newLeads){ read('leads',[]).forEach(function(l,i){ if(!l.status || l.status==='Новая') out.push({type:'lead',level:'hot',title:'Новая заявка',text:(l.name||l.phone||'Без имени')+' — '+(l.service||l.source||''),meta:l.phone||'',index:i}); }); }
    if(s.tasks){ read('tasks',[]).forEach(function(t,i){ if(!['Готово','Отменено'].includes(t.status||'') && (overdue(t.due_at)||dueSoon(t.due_at,24))) out.push({type:'task',level:overdue(t.due_at)?'hot':'warn',title:'Задача: '+(t.title||''),text:t.description||'',meta:t.due_at?new Date(t.due_at).toLocaleString('ru-RU'):'без срока',index:i}); }); }
    if(s.orders){ read('orders',[]).forEach(function(o,i){ if(!['Выдан','Оплачено','Отменён'].includes(o.status||'') && (overdue(o.deadline)||dueSoon(o.deadline,24))) out.push({type:'order',level:overdue(o.deadline)?'hot':'warn',title:'Срок заказа',text:(o.project||'Заказ')+' — '+(o.client||''),meta:o.deadline||'без срока',index:i}); }); }
    if(s.production){ read('production_jobs',[]).forEach(function(j,i){ if(!['Готово','Выдано','Отменено'].includes(j.production_status||'') && (overdue(j.deadline)||dueSoon(j.deadline,24))) out.push({type:'production',level:overdue(j.deadline)?'hot':'warn',title:'Производство',text:j.title||'Производственная задача',meta:j.deadline?new Date(j.deadline).toLocaleString('ru-RU'):'без срока',index:i}); }); }
    if(s.debts){ read('orders',[]).forEach(function(o,i){ if(Number(o.balance||0)>0 && !['Отменён'].includes(o.status||'')) out.push({type:'debt',level:'warn',title:'Остаток оплаты',text:(o.project||'Заказ')+' — '+rub(o.balance),meta:o.client||'',index:i}); }); }
    return out.slice(0,40);
  }
  function action(n){
    if(n.type==='lead'){ var tab=document.querySelector('[data-tab=leads]'); if(tab) tab.click(); setTimeout(function(){ window.LeaderLeadCard&&LeaderLeadCard.open(n.index); },300); }
    if(n.type==='task'){ var tab2=document.querySelector('[data-tab=tasks]'); if(tab2) tab2.click(); }
    if(n.type==='order'||n.type==='debt'){ var tab3=document.querySelector('[data-tab=orders]'); if(tab3) tab3.click(); setTimeout(function(){ window.LeaderOrderCard&&LeaderOrderCard.open(n.index); },300); }
    if(n.type==='production'){ var tab4=document.querySelector('[data-tab=production]'); if(tab4) tab4.click(); setTimeout(function(){ window.LeaderProduction&&LeaderProduction.open(n.index); },300); }
    hide();
  }
  function ensure(){
    var host=document.querySelector('.top .row.no-print');
    if(host && !document.getElementById('ntButton')){
      var b=document.createElement('button'); b.id='ntButton'; b.className='nt-bell'; b.innerHTML='Уведомления <span id="ntBadge" class="nt-badge" style="display:none">0</span>'; b.onclick=toggle; host.appendChild(b);
    }
    if(!document.getElementById('ntPanel')){
      document.body.insertAdjacentHTML('beforeend','<div id="ntPanel" class="nt-panel"><div class="nt-head"><div><div class="nt-title">Центр уведомлений</div><div class="nt-meta">Локальные напоминания по заявкам, задачам, заказам и долгам</div></div><button onclick="LeaderNotifications.hide()">×</button></div><div id="ntList" class="nt-list"></div><div class="nt-settings"><b>Настройки</b><label><input id="ntBrowser" type="checkbox"> Браузерные уведомления</label><label><input id="ntNewLeads" type="checkbox"> Новые заявки</label><label><input id="ntTasks" type="checkbox"> Задачи</label><label><input id="ntOrders" type="checkbox"> Сроки заказов</label><label><input id="ntProduction" type="checkbox"> Производство</label><label><input id="ntDebts" type="checkbox"> Долги</label><div class="nt-actions"><button onclick="LeaderNotifications.saveUiSettings()">Сохранить настройки</button><button onclick="LeaderNotifications.requestPermission()">Разрешить уведомления</button></div></div></div>');
    }
  }
  function render(){
    ensure(); var list=build(); var badge=document.getElementById('ntBadge'); if(badge){ badge.textContent=list.length; badge.style.display=list.length?'inline-block':'none'; }
    var box=document.getElementById('ntList'); if(!box) return;
    box.innerHTML=list.length?list.map(function(n,i){return '<div class="nt-item nt-'+esc(n.level)+'"><b>'+esc(n.title)+'</b><div>'+esc(n.text)+'</div><div class="nt-meta">'+esc(n.meta||'')+'</div><div class="nt-actions"><button onclick="LeaderNotifications.openItem('+i+')">Открыть</button><button onclick="LeaderNotifications.copyItem('+i+')">Скопировать</button></div></div>';}).join(''):'<div class="nt-empty">Сейчас срочных уведомлений нет</div>';
    var s=settings(); [['ntBrowser','browser'],['ntNewLeads','newLeads'],['ntTasks','tasks'],['ntOrders','orders'],['ntProduction','production'],['ntDebts','debts']].forEach(function(x){ var e=document.getElementById(x[0]); if(e) e.checked=!!s[x[1]]; });
  }
  function toggle(){ render(); document.getElementById('ntPanel').classList.toggle('show'); }
  function hide(){ var p=document.getElementById('ntPanel'); if(p) p.classList.remove('show'); }
  async function saveCloudSettings(s){ var client=db(); if(!client) return; try{ var u=await client.auth.getUser(); if(!u.data.user) return; await client.rpc('leader_upsert_notification_preferences',{p_browser_notifications:!!s.browser,p_settings:s}); }catch(e){console.warn(e)} }
  function maybeNotify(){
    var s=settings(); if(!s.browser || !('Notification' in window) || Notification.permission!=='granted') return;
    var last=Number(localStorage.getItem('leader_last_browser_notify')||0); if(Date.now()-last<30*60*1000) return;
    var list=build(); if(!list.length) return;
    new Notification('РА «Лидер»: есть срочные дела', {body:list.slice(0,3).map(x=>x.title).join(' • ')});
    localStorage.setItem('leader_last_browser_notify', String(Date.now()));
  }
  window.LeaderNotifications={
    render:render, toggle:toggle, hide:hide,
    openItem:function(i){ var n=build()[i]; if(n) action(n); },
    copyItem:function(i){ var n=build()[i]; if(!n) return; navigator.clipboard.writeText(n.title+'\n'+n.text+'\n'+(n.meta||'')); toast('Уведомление скопировано'); },
    saveUiSettings:function(){ var s={browser:document.getElementById('ntBrowser').checked,newLeads:document.getElementById('ntNewLeads').checked,tasks:document.getElementById('ntTasks').checked,orders:document.getElementById('ntOrders').checked,production:document.getElementById('ntProduction').checked,debts:document.getElementById('ntDebts').checked}; saveSettings(s); saveCloudSettings(s); render(); toast('Настройки уведомлений сохранены'); },
    requestPermission:async function(){ if(!('Notification' in window)) return alert('Браузер не поддерживает уведомления'); var r=await Notification.requestPermission(); toast('Разрешение: '+r); var s=settings(); s.browser=(r==='granted'); saveSettings(s); saveCloudSettings(s); render(); },
    build:build
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){ensure(); render();},1300); setInterval(function(){render(); maybeNotify();},60000); });
})();
