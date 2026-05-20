(function(){
  function el(id){return document.getElementById(id)}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
  function money(v){return Math.round(Number(v||0)).toLocaleString('ru-RU')+' ₽'}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(e){return v||'—'}}
  function toast(t){var x=el('toast');if(x){x.textContent=t;x.classList.add('show');setTimeout(function(){x.classList.remove('show')},2300)}else alert(t)}
  function timeout(p,ms,label){return Promise.race([p,new Promise(function(_,reject){setTimeout(function(){reject(new Error(label||'Нет ответа'))},ms)})])}
  var orders=[];
  var orderStatuses=['Новый','КП отправлено','Согласовано','Передано подрядчику','В работе','Готов','Выдан','Отменён'];
  var payStatuses=['Не оплачено','Предоплата','Оплачено полностью','Долг','Возврат'];
  var layoutStatuses=['Макета нет','Нужен дизайн','Клиент прислал макет','Макет плохого качества','В работе у дизайнера','На согласовании','Требуются правки','Согласован','Передан в производство'];
  var prodStatuses=['Не передано','Передан подрядчику','В работе','Готов','Получен','Выдан клиенту','Монтаж назначен','Монтаж выполнен'];
  function opt(list,val){return list.map(function(x){return '<option '+(x===(val||'')?'selected':'')+'>'+esc(x)+'</option>'}).join('')}
  function badge(text){var cls='';if(['Готов','Выдан','Оплачено полностью','Согласован','Создан заказ'].indexOf(text)>=0)cls=' good';if(['В работе','Новый','Нужен дизайн','КП отправлено','На согласовании','Предоплата'].indexOf(text)>=0)cls=' warn';if(['Отменён','Долг','Требуются правки'].indexOf(text)>=0)cls=' bad';return '<span class="badge'+cls+'">'+esc(text||'—')+'</span>'}
  function orderType(o){return o&&o.data&&o.data.order_type?o.data.order_type:'—'}
  async function session(){if(!window.db)throw new Error('Supabase не подключён');var r=await timeout(window.db.auth.getSession(),10000,'Не удалось проверить вход за 10 секунд');if(!r.data||!r.data.session)throw new Error('Сначала войдите в CRM');return r.data.session}
  async function api(body){await session();var r=await timeout(window.db.functions.invoke('leader-crm-orders',{body:body}),15000,'Сервер заказов не ответил за 15 секунд');if(r.error)throw new Error(r.error.message||'Ошибка запроса');if(r.data&&r.data.error)throw new Error(r.data.error+(r.data.details?': '+r.data.details:''));return r.data||{}}
  function renderOrders(list){orders=list||orders||[];var box=el('ordersList');if(!box)return;if(!orders.length){box.className='work-list empty';box.textContent='Заказов пока нет.';return}box.className='work-list';box.innerHTML=orders.map(function(o){return '<div class="work-item order-card" data-order-id="'+esc(o.id)+'">'
    +'<b>№'+esc(o.order_number||(o.id||'').slice(0,8))+' — '+esc(o.project_name||'Без названия')+'</b> '+badge(o.status||'Новый')
    +'<div class="meta">'+esc(o.client_name||'Клиент не указан')+' • '+esc(orderType(o))+' • '+money(o.client_total)+' • '+esc(o.payment_status||'Оплата не указана')+'</div>'
    +'<div class="meta">Создан: '+dt(o.created_at)+' • Срок: '+esc(o.deadline||'не указан')+'</div>'
    +'<div class="form-grid compact" style="margin-top:10px">'
      +'<label>Статус заказа<select data-field="status">'+opt(orderStatuses,o.status||'Новый')+'</select></label>'
      +'<label>Оплата<select data-field="payment_status">'+opt(payStatuses,o.payment_status||'Не оплачено')+'</select></label>'
      +'<label>Макет / дизайн<select data-field="layout_status">'+opt(layoutStatuses,o.layout_status||'Макета нет')+'</select></label>'
      +'<label>Производство<select data-field="production_status">'+opt(prodStatuses,o.production_status||'Не передано')+'</select></label>'
    +'</div>'
    +'</div>'}).join('')}
  function renderDesign(list){var box=el('designList');if(!box)return;var tasks=(list||orders||[]).filter(function(o){return ['Нужен дизайн','В работе у дизайнера','На согласовании','Требуются правки'].indexOf(o.layout_status||'')>=0});if(!tasks.length){box.className='work-list empty';box.textContent='Пока нет задач дизайна.';return}box.className='work-list';box.innerHTML=tasks.map(function(o){return '<div class="work-item"><b>'+esc(o.project_name||'Без названия')+'</b> '+badge(o.layout_status||'Нужен дизайн')+'<div class="meta">Тип: '+esc(orderType(o))+' • Срок: '+esc(o.deadline||'не указан')+'</div><div class="meta">Задача: '+esc(o.layout_comment||'')+'</div></div>'}).join('')}
  function updateDash(list){if(window.LeaderV2Dashboard&&window.LeaderV2Dashboard.updateOrders)window.LeaderV2Dashboard.updateOrders(list||orders||[])}
  async function load(silent){try{if(!silent){var box=el('ordersList');if(box){box.className='work-list empty';box.textContent='Загружаю заказы...'}}var data=await api({action:'list'});orders=data.orders||[];try{localStorage.setItem('leader_v2_orders_cache',JSON.stringify(orders))}catch(e){}renderOrders(orders);renderDesign(orders);updateDash(orders);return orders}catch(e){if(!silent)alert(e.message);var cache=[];try{cache=JSON.parse(localStorage.getItem('leader_v2_orders_cache')||'[]')||[]}catch(x){}if(cache.length){orders=cache;renderOrders(cache);renderDesign(cache);updateDash(cache);toast('Показаны последние загруженные заказы')}else{var b=el('ordersList');if(b){b.className='work-list empty';b.textContent='Не удалось загрузить заказы: '+e.message}}throw e}}
  async function update(id,patch){var data=await api(Object.assign({action:'update',id:id},patch));var o=data.order;if(o){orders=orders.map(function(x){return x.id===id?Object.assign({},x,o):x});renderOrders(orders);renderDesign(orders);updateDash(orders);toast('Заказ обновлён')}return o}
  function bind(){var b=el('reloadOrdersBtn');if(b){var nb=b.cloneNode(true);nb.onclick=function(){load(false).then(function(list){toast('Заказы обновлены: '+list.length)}).catch(function(){})};b.parentNode.replaceChild(nb,b)}var list=el('ordersList');if(list&&!list.dataset.ordersV2){list.dataset.ordersV2='1';list.addEventListener('change',function(ev){var card=ev.target.closest('.order-card');var field=ev.target.dataset.field;if(!card||!field)return;var p={};p[field]=ev.target.value;update(card.dataset.orderId,p).catch(function(e){alert(e.message)})})}document.querySelectorAll('[data-page="orders"],[data-page="design"],[data-page="dashboard"]').forEach(function(t){if(!t.dataset.ordersV2){t.dataset.ordersV2='1';t.addEventListener('click',function(){setTimeout(function(){load(true).catch(function(){})},250)})}})}
  window.LeaderV2Orders={load:load,renderOrders:renderOrders,renderDesign:renderDesign,update:update};
  document.addEventListener('DOMContentLoaded',function(){bind();setTimeout(function(){bind();load(true).catch(function(){})},900)});
})();
