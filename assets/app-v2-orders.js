(function(){
  function loadScript(src){
    if(!document.querySelector('script[src="'+src+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }
  loadScript('assets/app-v2-auth-fix.js');
  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}); }
  function money(v){ return Math.round(Number(v || 0)).toLocaleString('ru-RU') + ' ₽'; }
  function dt(v){ try { return v ? new Date(v).toLocaleString('ru-RU') : '—'; } catch(e){ return v || '—'; } }
  function toast(text){ var t=el('toast'); if(t){ t.textContent=text; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); } else { alert(text); } }
  function withTimeout(p,ms,label){return Promise.race([p,new Promise(function(_,reject){setTimeout(function(){reject(new Error(label||'Превышено время ожидания'))},ms)})])}
  function badge(text){
    var cls='';
    if(['Готов','Выдан','Оплачено','Согласован','Создан заказ'].indexOf(text)>=0) cls=' good';
    if(['В работе','Новый','Нужен дизайн','КП отправлено','На согласовании'].indexOf(text)>=0) cls=' warn';
    if(['Отменён','Долг','Требуются правки'].indexOf(text)>=0) cls=' bad';
    return '<span class="badge'+cls+'">'+esc(text || '—')+'</span>';
  }
  function showOrdersMessage(text){
    var box=el('ordersList');
    if(box){ box.className='work-list empty'; box.innerHTML=esc(text); }
  }
  async function api(body){
    if(!window.db) throw new Error('Supabase не подключён');
    var s = await withTimeout(window.db.auth.getSession(),10000,'Не удалось проверить вход за 10 секунд');
    if(!s || !s.data || !s.data.session) throw new Error('Сначала войдите в CRM');
    var r = await withTimeout(window.db.functions.invoke('leader-crm-leads',{body:body}),20000,'Supabase не ответил за 20 секунд');
    if(r.error) throw new Error(r.error.message || 'Ошибка запроса');
    if(r.data && r.data.error) throw new Error(r.data.error + (r.data.details ? ': '+r.data.details : ''));
    return r.data || {};
  }
  function orderType(o){ return (o.data && o.data.order_type) ? o.data.order_type : '—'; }
  function renderOrders(list){
    var box=el('ordersList'); if(!box) return;
    if(!list || !list.length){ box.className='work-list empty'; box.innerHTML='Заказов пока нет.'; return; }
    box.className='work-list';
    box.innerHTML=list.map(function(o){
      return '<div class="work-item">'
        + '<b>№'+esc(o.order_number || (o.id||'').slice(0,8))+' — '+esc(o.project_name || 'Без названия')+'</b> '+badge(o.status || 'Новый')
        + '<div class="meta">'+esc(o.client_name || 'Клиент не указан')+' • '+esc(orderType(o))+' • '+money(o.client_total)+' • '+esc(o.payment_status || 'Оплата не указана')+'</div>'
        + '<div class="meta">Макет: '+esc(o.layout_status || '—')+' • Производство: '+esc(o.production_status || '—')+' • Создан: '+dt(o.created_at)+'</div>'
        + '</div>';
    }).join('');
  }
  function renderDesign(list){
    var box=el('designList'); if(!box) return;
    var tasks=(list||[]).filter(function(o){ return ['Нужен дизайн','В работе у дизайнера','На согласовании','Требуются правки'].indexOf(o.layout_status || '') >= 0; });
    if(!tasks.length){ box.className='work-list empty'; box.innerHTML='Пока нет задач дизайна.'; return; }
    box.className='work-list';
    box.innerHTML=tasks.map(function(o){
      return '<div class="work-item">'
        + '<b>'+esc(o.project_name || 'Без названия')+'</b> '+badge(o.layout_status || 'Нужен дизайн')
        + '<div class="meta">Тип: '+esc(orderType(o))+' • Срок: '+esc(o.deadline || 'не указан')+'</div>'
        + '<div class="meta">Задача: '+esc(o.layout_comment || '')+'</div>'
        + '</div>';
    }).join('');
  }
  async function loadOrders(silent){
    try{
      if(!silent) showOrdersMessage('Загружаю заказы...');
      var data=await api({action:'list_orders'});
      var list=data.orders || [];
      renderOrders(list);
      renderDesign(list);
      return list;
    }catch(e){
      showOrdersMessage('Не удалось загрузить заказы: '+e.message);
      if(!silent) alert(e.message);
      throw e;
    }
  }
  function bind(){
    var b=el('reloadOrdersBtn');
    if(b && !b.dataset.ordersBound){
      b.dataset.ordersBound='1';
      b.onclick=function(){ loadOrders(false).then(function(list){toast('Заказы обновлены: '+list.length)}).catch(function(){}); };
    }
    var create=el('createOrderBtn');
    if(create && !create.dataset.ordersRefreshBound){
      create.dataset.ordersRefreshBound='1';
      create.addEventListener('click',function(){
        setTimeout(function(){ loadOrders(true).catch(function(){}) },1500);
        setTimeout(function(){ loadOrders(true).catch(function(){}) },3500);
      });
    }
    document.querySelectorAll('[data-page="orders"],[data-page="design"]').forEach(function(tab){
      if(!tab.dataset.ordersTabBound){
        tab.dataset.ordersTabBound='1';
        tab.addEventListener('click',function(){ setTimeout(function(){ loadOrders(true).catch(function(){}) },250); });
      }
    });
  }
  window.LeaderV2Orders={load:loadOrders,renderOrders:renderOrders,renderDesign:renderDesign};
  document.addEventListener('DOMContentLoaded',function(){
    bind();
    setTimeout(function(){ bind(); loadOrders(true).catch(function(){}); },1500);
    setInterval(function(){
      bind();
      var ordersOpen=el('orders')&&el('orders').classList.contains('active');
      var designOpen=el('design')&&el('design').classList.contains('active');
      if(ordersOpen||designOpen) loadOrders(true).catch(function(){});
    },5000);
  });
})();
