(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(x){return v||'—'}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('orderTimelineCss'))return;
    var s=document.createElement('style');
    s.id='orderTimelineCss';
    s.textContent='.order-timeline-box{margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.order-timeline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.order-timeline-title{font-weight:900;font-size:15px}.order-timeline-sub{font-size:12px;color:#6b7280;line-height:1.4;margin-top:3px}.order-timeline-actions{display:flex;gap:7px;flex-wrap:wrap}.order-timeline-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer}.order-timeline-list{display:grid;gap:8px;max-height:420px;overflow:auto;padding-right:4px}.order-timeline-item{display:grid;grid-template-columns:94px 1fr;gap:9px;border:1px solid var(--line);border-radius:12px;padding:9px;background:#f9fafb}.order-timeline-item.payment{background:#f0fdf4;border-color:#bbf7d0}.order-timeline-item.design{background:#eff6ff;border-color:#bfdbfe}.order-timeline-item.production{background:#fff7ed;border-color:#fed7aa}.order-timeline-item.installation{background:#f5f3ff;border-color:#ddd6fe}.order-timeline-item.warning{background:#fef2f2;border-color:#fecaca}.order-timeline-kind{font-size:11px;font-weight:900;color:#374151;text-transform:uppercase}.order-timeline-body b{font-size:13px}.order-timeline-meta{color:#6b7280;font-size:12px;line-height:1.4;margin-top:3px}.order-timeline-empty{color:#6b7280;font-size:13px;padding:10px;background:#f9fafb;border:1px dashed var(--line);border-radius:12px}.order-timeline-filter{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.order-timeline-filter button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:900;cursor:pointer}.order-timeline-filter button.active{background:#111827;color:#fff}@media(max-width:560px){.order-timeline-item{grid-template-columns:1fr}.order-timeline-actions button,.order-timeline-filter button{flex:1}.order-timeline-list{max-height:none}}';
    document.head.appendChild(s);
  }
  function add(arr,kind,title,body,at,extra){
    arr.push({kind:kind,title:title||'Событие',body:body||'',at:at||new Date().toISOString(),extra:extra||{}});
  }
  async function safe(promise,fallback){try{return await promise}catch(x){return fallback}}
  async function fetchTimeline(orderId){
    await needLogin();
    var events=[];
    var orderRes=await window.db.from('leader_orders').select('*').eq('id',orderId).single();
    var order=orderRes.error?null:orderRes.data;
    if(order){
      add(events,'order','Заказ создан',(order.project_name||'Без названия')+' • клиент: '+(order.client_name||'—')+' • сумма: '+money(order.client_total),order.created_at,{status:order.status});
      if(order.current_stage||order.next_action)add(events,'order','Текущий этап',(order.current_stage||'—')+' • '+(order.progress_percent||0)+'%\nСледующий шаг: '+(order.next_action||'—'),order.stage_updated_at||order.updated_at||order.created_at);
      if(order.deadline)add(events,'order','Срок заказа','Плановый срок: '+dt(order.deadline),order.deadline);
    }

    var comments=(await safe(window.db.from('leader_order_comments').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(80),{data:[]})).data||[];
    comments.forEach(function(x){add(events,'comment','Комментарий к заказу',x.body||x.comment||'',x.created_at,{type:x.comment_type})});

    var status=(await safe(window.db.from('leader_order_status_history').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
    status.forEach(function(x){add(events,'status','Статус заказа',(x.old_status?x.old_status+' → ':'')+(x.new_status||'—')+(x.comment?'\n'+x.comment:''),x.created_at)});

    var payments=(await safe(window.db.from('leader_payments').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
    payments.forEach(function(x){add(events,'payment',(x.payment_type||'Платёж')+' '+money(x.amount),(x.method?'Метод: '+x.method+'\n':'')+(x.comment||''),x.created_at||x.payment_date)});

    var design=(await safe(window.db.from('leader_design_tasks').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(60),{data:[]})).data||[];
    design.forEach(function(t){add(events,'design','Дизайн-задача создана',(t.title||'Без названия')+'\nСтатус: '+(t.task_status||'—')+' / '+(t.layout_status||'—')+(t.layout_link?'\nМакет: '+t.layout_link:''),t.created_at,{task_id:t.id});
      if(t.started_at)add(events,'design','Дизайн взят в работу',t.title||'',t.started_at,{task_id:t.id});
      if(t.sent_to_client_at)add(events,'design','Макет отправлен клиенту',t.title||'',t.sent_to_client_at,{task_id:t.id});
      if(t.approved_at)add(events,'design','Макет согласован',t.title||'',t.approved_at,{task_id:t.id});
      if(t.completed_at)add(events,'design','Дизайн завершён',t.result_comment||t.title||'',t.completed_at,{task_id:t.id});
    });
    var designIds=design.map(function(t){return t.id});
    if(designIds.length){
      var dc=(await safe(window.db.from('leader_design_task_comments').select('*').in('task_id',designIds).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
      dc.forEach(function(x){add(events,'design','Комментарий дизайна',x.body||'',x.created_at,{task_id:x.task_id,type:x.comment_type})});
      var de=(await safe(window.db.from('leader_design_task_events').select('*').in('task_id',designIds).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
      de.forEach(function(x){add(events,'design','Событие дизайна',(x.old_status?x.old_status+' → ':'')+(x.new_status||'—')+(x.body?'\n'+x.body:''),x.created_at,{task_id:x.task_id})});
    }

    var production=(await safe(window.db.from('leader_production_jobs').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(60),{data:[]})).data||[];
    production.forEach(function(j){add(events,'production','Производство создано',(j.title||'Без названия')+'\nСтатус: '+(j.production_status||'—')+'\nПодрядчик: '+(j.contractor_name||'—'),j.created_at,{job_id:j.id});
      if(j.ready_at)add(events,'production','Производство готово',j.title||'',j.ready_at,{job_id:j.id});
      if(j.issued_at)add(events,'production','Производство выдано',j.title||'',j.issued_at,{job_id:j.id});
    });
    var productionIds=production.map(function(j){return j.id});
    if(productionIds.length){
      var pe=(await safe(window.db.from('leader_production_events').select('*').in('job_id',productionIds).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
      pe.forEach(function(x){add(events,'production','Событие производства',(x.old_status?x.old_status+' → ':'')+(x.new_status||'—')+(x.body?'\n'+x.body:''),x.created_at,{job_id:x.job_id})});
    }

    var installation=(await safe(window.db.from('leader_installation_jobs').select('*').eq('order_id',orderId).order('created_at',{ascending:false}).limit(60),{data:[]})).data||[];
    installation.forEach(function(j){add(events,'installation','Монтаж создан',(j.title||'Без названия')+'\nСтатус: '+(j.install_status||'—')+'\nАдрес: '+(j.address||'—')+'\nМонтажник: '+(j.installer_name||'—'),j.created_at,{job_id:j.id});
      if(j.scheduled_at)add(events,'installation','Монтаж назначен','Адрес: '+(j.address||'—')+'\nМонтажник: '+(j.installer_name||'—'),j.scheduled_at,{job_id:j.id});
      if(j.started_at)add(events,'installation','Монтаж начат',j.title||'',j.started_at,{job_id:j.id});
      if(j.completed_at)add(events,'installation','Монтаж выполнен',j.result_comment||j.title||'',j.completed_at,{job_id:j.id});
      if(j.accepted_at)add(events,'installation','Клиент принял монтаж',j.result_comment||j.title||'',j.accepted_at,{job_id:j.id});
    });
    var installationIds=installation.map(function(j){return j.id});
    if(installationIds.length){
      var ic=(await safe(window.db.from('leader_installation_comments').select('*').in('job_id',installationIds).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
      ic.forEach(function(x){add(events,'installation','Комментарий монтажа',x.body||'',x.created_at,{job_id:x.job_id,type:x.comment_type})});
      var ie=(await safe(window.db.from('leader_installation_events').select('*').in('job_id',installationIds).order('created_at',{ascending:false}).limit(100),{data:[]})).data||[];
      ie.forEach(function(x){add(events,'installation','Событие монтажа',(x.old_status?x.old_status+' → ':'')+(x.new_status||'—')+(x.body?'\n'+x.body:''),x.created_at,{job_id:x.job_id})});
    }

    events.sort(function(a,b){return new Date(b.at||0)-new Date(a.at||0)});
    return events;
  }
  function label(kind){return {order:'Заказ',comment:'Коммент.',status:'Статус',payment:'Оплата',design:'Дизайн',production:'Производ.',installation:'Монтаж'}[kind]||kind}
  function kindClass(kind){return {payment:'payment',design:'design',production:'production',installation:'installation',status:'warning'}[kind]||''}
  function renderList(box,events,filter){
    var list=filter&&filter!=='all'?events.filter(function(x){return x.kind===filter}):events;
    var body=box.querySelector('.order-timeline-list');
    if(!body)return;
    if(!list.length){body.innerHTML='<div class="order-timeline-empty">Событий пока нет.</div>';return;}
    body.innerHTML=list.map(function(x){return '<div class="order-timeline-item '+kindClass(x.kind)+'"><div><div class="order-timeline-kind">'+h(label(x.kind))+'</div><div class="order-timeline-meta">'+dt(x.at)+'</div></div><div class="order-timeline-body"><b>'+h(x.title)+'</b><div class="order-timeline-meta">'+h(x.body).replace(/\n/g,'<br>')+'</div></div></div>'}).join('');
  }
  function renderBox(box,events){
    box.__events=events||[];
    box.__filter='all';
    box.innerHTML='<div class="order-timeline-head"><div><div class="order-timeline-title">Единая история заказа</div><div class="order-timeline-sub">Оплаты, комментарии, статусы, дизайн, производство и монтаж в одной ленте.</div></div><div class="order-timeline-actions"><button data-timeline-action="refresh">Обновить</button></div></div><div class="order-timeline-filter"><button data-timeline-filter="all" class="active">Все</button><button data-timeline-filter="payment">Оплата</button><button data-timeline-filter="design">Дизайн</button><button data-timeline-filter="production">Производство</button><button data-timeline-filter="installation">Монтаж</button><button data-timeline-filter="comment">Комментарии</button></div><div class="order-timeline-list"></div>';
    renderList(box,events,'all');
  }
  async function renderForCard(card,force){
    var detail=card.querySelector('.order-detail');
    if(!detail)return;
    var orderId=card.dataset.order;
    var box=detail.querySelector('.order-timeline-box');
    if(!box){
      box=document.createElement('div');
      box.className='order-timeline-box';
      var progress=detail.querySelector('.order-progress-box');
      if(progress)progress.insertAdjacentElement('afterend',box);else detail.appendChild(box);
    }
    if(box.dataset.loaded&&!force)return;
    box.textContent='Загружаю единую историю заказа...';
    try{var events=await fetchTimeline(orderId);box.dataset.loaded='1';renderBox(box,events)}catch(err){box.innerHTML='<div class="order-timeline-empty" style="color:#991b1b">Не удалось загрузить историю: '+h(err.message||err)+'</div>'}
  }
  function enhance(){
    css();
    document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){
      if(card.querySelector('.order-detail'))renderForCard(card,false);
    });
  }
  function observe(){
    var box=e('ordersList');
    if(box&&!box.dataset.timelineObserver){
      if(window.MutationObserver){var mo=new MutationObserver(function(){enhance()});mo.observe(box,{childList:true,subtree:true})}
      box.dataset.timelineObserver='1';
    }
    document.addEventListener('click',function(ev){
      var refresh=ev.target.closest('[data-timeline-action="refresh"]');
      if(refresh){var card=refresh.closest('.work-item[data-order]');var tl=refresh.closest('.order-timeline-box');if(tl)tl.dataset.loaded='';if(card)renderForCard(card,true);return}
      var f=ev.target.closest('[data-timeline-filter]');
      if(f){var bx=f.closest('.order-timeline-box');if(!bx)return;bx.querySelectorAll('[data-timeline-filter]').forEach(function(b){b.classList.toggle('active',b===f)});renderList(bx,bx.__events||[],f.dataset.timelineFilter);}
    });
    enhance();
  }
  window.LeaderV2OrderTimeline={fetch:fetchTimeline,enhance:enhance,renderForCard:renderForCard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1500)});else setTimeout(observe,1000);
})();
