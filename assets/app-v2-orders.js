(function(){
  function el(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]}); }
  function money(v){ return Math.round(Number(v || 0)).toLocaleString('ru-RU') + ' ₽'; }
  function dt(v){ try { return v ? new Date(v).toLocaleString('ru-RU') : '—'; } catch(e){ return v || '—'; } }
  function toast(text){ var t=el('toast'); if(t){ t.textContent=text; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); } else { alert(text); } }
  function badge(text){
    var cls='';
    if(['Готов','Выдан','Оплачено','Согласован','Создан заказ'].indexOf(text)>=0) cls=' good';
    if(['В работе','Новый','Нужен дизайн','КП отправлено','На согласовании'].indexOf(text)>=0) cls=' warn';
    if(['Отменён','Долг','Требуются правки'].indexOf(text)>=0) cls=' bad';
    return '<span class="badge'+cls+'">'+esc(text || '—')+'</span>';
  }
  async function api(body){
    if(!window.db) throw new Error('Supabase не подключён');
    var s = await window.db.auth.getSession();
    if(!s || !s.data || !s.data.session) throw new Error('Сначала войдите в CRM');
    var r = await window.db.functions.invoke('leader-crm-leads',{body:body});
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
  async function loadOrders(){
    var data=await api({action:'list_orders'});
    var list=data.orders || [];
    renderOrders(list);
    renderDesign(list);
    return list;
  }
  function bind(){
    var b=el('reloadOrdersBtn');
    if(b && !b.dataset.ordersBound){
      b.dataset.ordersBound='1';
      b.onclick=function(){ loadOrders().then(function(){toast('Заказы обновлены')}).catch(function(e){alert(e.message)}); };
    }
    document.querySelectorAll('[data-page="orders"],[data-page="design"]').forEach(function(tab){
      if(!tab.dataset.ordersTabBound){
        tab.dataset.ordersTabBound='1';
        tab.addEventListener('click',function(){ setTimeout(function(){ loadOrders().catch(function(){}) },250); });
      }
    });
  }
  window.LeaderV2Orders={load:loadOrders,renderOrders:renderOrders,renderDesign:renderDesign};
  document.addEventListener('DOMContentLoaded',function(){ bind(); setTimeout(function(){ loadOrders().catch(function(){}); },1500); });
})();
