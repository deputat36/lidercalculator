(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(x){return v||'—'}}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('orderProgressCss'))return;
    var s=document.createElement('style');
    s.id='orderProgressCss';
    s.textContent='.order-progress-box{margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.order-progress-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}.order-progress-title{font-weight:900;font-size:15px}.order-progress-sub{font-size:12px;color:var(--muted);line-height:1.4;margin-top:3px}.order-progress-bar{height:12px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:10px 0}.order-progress-fill{height:100%;background:#111827;border-radius:999px;transition:width .25s ease}.order-progress-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.order-progress-grid div{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:9px}.order-progress-grid span{display:block;color:var(--muted);font-size:11px;font-weight:900;margin-bottom:4px}.order-progress-grid b{font-size:13px}.order-progress-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.order-progress-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer}.order-progress-actions .primary{background:#111827;color:#fff}.order-progress-warn{margin-top:8px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:8px;font-size:12px;line-height:1.4}@media(max-width:720px){.order-progress-grid{grid-template-columns:1fr 1fr}}@media(max-width:480px){.order-progress-grid{grid-template-columns:1fr}.order-progress-actions button{flex:1}}';
    document.head.appendChild(s);
  }
  async function fetchOrder(id){var r=await window.db.from('leader_orders').select('*').eq('id',id).single();if(r.error)throw new Error(r.error.message);return r.data}
  async function fetchPayments(id){var r=await window.db.from('leader_payments').select('*').eq('order_id',id);return r.error?[]:(r.data||[])}
  async function fetchDesign(id){var r=await window.db.from('leader_design_tasks').select('*').eq('order_id',id);return r.error?[]:(r.data||[])}
  async function fetchProduction(id){var r=await window.db.from('leader_production_jobs').select('*').eq('order_id',id);return r.error?[]:(r.data||[])}
  function hasDesign(order,design){
    if(design&&design.length)return true;
    var ls=String(order.layout_status||'').toLowerCase();
    var txt=[order.layout_comment,order.internal_comment,order.public_comment,order.project_name].join(' ').toLowerCase();
    return /дизайн|макет|верст|вёрст/.test(ls+' '+txt);
  }
  function hasProduction(order,production){
    if(production&&production.length)return true;
    var ps=String(order.production_status||'').toLowerCase();
    var txt=[order.production_comment,order.project_name,order.data&&order.data.order_type].join(' ').toLowerCase();
    return /производ|печать|баннер|наклей|таблич|вывес|монтаж|плен|плён/.test(ps+' '+txt);
  }
  function hasMounting(order,production){
    var txt=[order.production_status,order.production_comment,order.internal_comment,order.public_comment,order.project_name,JSON.stringify(order.data||{})].join(' ').toLowerCase();
    if(/монтаж выполнен|монтаж назначен|монтаж/.test(txt))return true;
    return (production||[]).some(function(j){return /монтаж/.test([j.production_status,j.title,j.technical_task,j.contractor_comment,j.internal_comment].join(' ').toLowerCase())});
  }
  function paidAmount(payments,order){
    var p=(payments||[]).reduce(function(a,x){return a+n(x.amount)*(x.payment_type==='Расход'?-1:1)},0);
    return p||n(order.prepayment);
  }
  function latest(list,field){return (list||[]).some(function(x){return String(x[field]||'')})}
  function statusIn(list,field,values){return (list||[]).some(function(x){return values.indexOf(x[field])>=0})}
  function calc(order,payments,design,production){
    var total=n(order.client_total), paid=paidAmount(payments,order), balance=Math.max(0,total-paid);
    var designNeeded=hasDesign(order,design), productionNeeded=hasProduction(order,production), mountingNeeded=hasMounting(order,production);
    var score=0, max=0, stage='Новый заказ', next='Проверить заказ и связаться с клиентом', responsible='Менеджер';
    function step(weight,done){max+=weight;if(done)score+=weight;}

    step(10,!!order.created_at);
    step(10,['Согласовано','Передано подрядчику','В работе','Готов','Выдан'].indexOf(order.status)>=0 || total>0);
    step(15,paid>0 || order.payment_status==='Оплачено полностью');

    if(designNeeded){
      step(10,design.length>0);
      step(10,statusIn(design,'task_status',['Готова','Согласована','Передана в производство']) || ['Согласован','Готовый файл'].indexOf(order.layout_status)>=0);
    }
    if(productionNeeded){
      step(10,production.length>0 || ['Передан подрядчику','В работе','Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(order.production_status)>=0);
      step(15,statusIn(production,'production_status',['Готов','Получен','Выдан клиенту','Монтаж выполнен']) || ['Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(order.production_status)>=0);
    }
    if(mountingNeeded){
      step(10,['Монтаж назначен','Монтаж выполнен'].indexOf(order.production_status)>=0 || statusIn(production,'production_status',['Монтаж назначен','Монтаж выполнен']));
      step(10,order.production_status==='Монтаж выполнен' || statusIn(production,'production_status',['Монтаж выполнен']));
    }
    step(15,balance<=0 && total>0 || order.payment_status==='Оплачено полностью');
    step(5,['Выдан','Закрыт'].indexOf(order.status)>=0 || !!order.issued_at);

    var pct=max>0?Math.min(100,Math.round(score/max*100)):0;

    if(total<=0){stage='Ошибка расчёта';next='Проверить сумму заказа: цена клиенту не должна быть 0 ₽';responsible='Менеджер';pct=0;}
    else if(paid<=0){stage='Ожидает предоплату';next='Получить предоплату или подтвердить запуск без предоплаты';responsible='Менеджер';pct=Math.min(pct,35);}
    else if(designNeeded && !design.length){stage='Нужна дизайн-задача';next='Создать ТЗ дизайнеру';responsible='Менеджер';pct=Math.min(pct,40);}
    else if(designNeeded && !statusIn(design,'task_status',['Готова','Согласована','Передана в производство']) && ['Согласован','Готовый файл'].indexOf(order.layout_status)<0){stage='Макет в работе / на согласовании';next='Проверить статус дизайна или согласовать макет с клиентом';responsible='Дизайнер / менеджер';pct=Math.min(pct,60);}
    else if(productionNeeded && !production.length && ['Передан подрядчику','В работе','Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(order.production_status)<0){stage='Нужно производство';next='Создать производственное задание и отправить ТЗ подрядчику';responsible='Менеджер';pct=Math.min(pct,65);}
    else if(productionNeeded && !statusIn(production,'production_status',['Готов','Получен','Выдан клиенту','Монтаж выполнен']) && ['Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(order.production_status)<0){stage='В производстве';next='Получить статус/готовность от подрядчика';responsible='Подрядчик / менеджер';pct=Math.min(pct,85);}
    else if(mountingNeeded && !(order.production_status==='Монтаж выполнен' || statusIn(production,'production_status',['Монтаж выполнен']))){stage='Нужен монтаж';next='Назначить монтажника или получить отметку о выполнении монтажа';responsible='Менеджер / монтажник';pct=Math.min(pct,95);}
    else if(balance>0){stage='Ожидает доплату';next='Получить остаток оплаты '+money(balance);responsible='Менеджер';pct=Math.min(pct,97);}
    else if(['Выдан','Закрыт'].indexOf(order.status)<0 && !order.issued_at){stage='Готов к выдаче / закрытию';next='Выдать заказ клиенту и закрыть заказ';responsible='Менеджер';pct=Math.max(pct,97);}
    else{stage='Заказ завершён';next='Действий не требуется';responsible='CRM';pct=100;}

    var overdue=[];
    var now=Date.now();
    if(order.deadline && new Date(order.deadline).getTime()<now && ['Выдан','Закрыт'].indexOf(order.status)<0)overdue.push('Просрочен общий срок заказа');
    (design||[]).forEach(function(t){if(t.deadline && new Date(t.deadline).getTime()<now && ['Готова','Согласована','Передана в производство','Отменена'].indexOf(t.task_status)<0)overdue.push('Просрочена дизайн-задача: '+(t.title||'без названия'))});
    (production||[]).forEach(function(j){if(j.deadline && new Date(j.deadline).getTime()<now && ['Готов','Получен','Выдан клиенту','Монтаж выполнен','Отменён'].indexOf(j.production_status)<0)overdue.push('Просрочено производство: '+(j.title||'без названия'))});

    return {stage:stage,next:next,responsible:responsible,progress:pct,total:total,paid:paid,balance:balance,designNeeded:designNeeded,productionNeeded:productionNeeded,mountingNeeded:mountingNeeded,overdue:overdue};
  }
  function renderBox(box,order,result){
    var warn=result.overdue&&result.overdue.length?'<div class="order-progress-warn">'+result.overdue.map(h).join('<br>')+'</div>':'';
    box.innerHTML='<div class="order-progress-head"><div><div class="order-progress-title">Этап заказа: '+h(result.stage)+'</div><div class="order-progress-sub">Следующий шаг: '+h(result.next)+'</div></div><div><b>'+result.progress+'%</b></div></div><div class="order-progress-bar"><div class="order-progress-fill" style="width:'+result.progress+'%"></div></div><div class="order-progress-grid"><div><span>Ответственный</span><b>'+h(result.responsible)+'</b></div><div><span>Оплачено</span><b>'+money(result.paid)+' / '+money(result.total)+'</b></div><div><span>Остаток</span><b>'+money(result.balance)+'</b></div><div><span>Последний расчёт</span><b>'+dt(order.stage_updated_at)+'</b></div></div>'+warn+'<div class="order-progress-actions"><button class="primary" data-op-action="save">Сохранить этап в заказ</button><button data-op-action="refresh">Пересчитать</button></div>';
  }
  async function build(orderId){
    await needLogin();
    var order=await fetchOrder(orderId);
    var payments=await fetchPayments(orderId);
    var design=await fetchDesign(orderId);
    var production=await fetchProduction(orderId);
    return {order:order,result:calc(order,payments,design,production)};
  }
  async function save(orderId,result){
    await needLogin();
    var patch={current_stage:result.stage,next_action:result.next,progress_percent:result.progress,stage_updated_at:new Date().toISOString()};
    var r=await window.db.from('leader_orders').update(patch).eq('id',orderId).select('id').single();
    if(r.error)throw new Error(r.error.message);
    await window.db.from('leader_order_status_history').insert({order_id:orderId,new_status:result.stage,comment:'Пересчитан этап заказа: '+result.progress+'%. Следующий шаг: '+result.next}).catch(function(){});
    toast('Этап заказа сохранён');
  }
  async function renderForCard(card,force){
    var detail=card.querySelector('.order-detail');
    if(!detail)return;
    var orderId=card.dataset.order;
    var box=detail.querySelector('.order-progress-box');
    if(!box){box=document.createElement('div');box.className='order-progress-box';var firstActions=detail.querySelector('.order-detail-actions');if(firstActions)firstActions.insertAdjacentElement('afterend',box);else detail.insertBefore(box,detail.firstChild)}
    if(box.dataset.loaded && !force)return;
    box.textContent='Считаю этап заказа...';
    try{
      var data=await build(orderId);
      box.dataset.loaded='1';
      box.__orderProgress=data;
      renderBox(box,data.order,data.result);
    }catch(err){box.innerHTML='<div class="order-progress-warn">Не удалось рассчитать этап: '+h(err.message||err)+'</div>'}
  }
  function enhance(){
    css();
    document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){
      var detail=card.querySelector('.order-detail');
      if(!detail)return;
      renderForCard(card,false);
    });
  }
  function observe(){
    var box=e('ordersList');
    if(box&&!box.dataset.progressObserver){
      if(window.MutationObserver){var mo=new MutationObserver(function(){enhance()});mo.observe(box,{childList:true,subtree:true})}
      box.dataset.progressObserver='1';
    }
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-op-action]');
      if(!btn)return;
      var card=btn.closest('.work-item[data-order]');
      var box=btn.closest('.order-progress-box');
      if(!card||!box)return;
      if(btn.dataset.opAction==='refresh'){
        box.dataset.loaded='';
        renderForCard(card,true);
      }
      if(btn.dataset.opAction==='save'){
        var data=box.__orderProgress;
        if(!data)return;
        save(card.dataset.order,data.result).then(function(){box.dataset.loaded='';renderForCard(card,true);if(window.LeaderV2Orders&&window.LeaderV2Orders.load)window.LeaderV2Orders.load(true).catch(function(){})}).catch(function(err){alert(err.message||err)});
      }
    });
    enhance();
  }
  window.LeaderV2OrderProgress={calc:calc,build:build,enhance:enhance,save:save};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1300)});else setTimeout(observe,900);
})();
