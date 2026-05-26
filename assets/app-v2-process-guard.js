(function(){
  var wrapped={production:false,installation:false};
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('processGuardCss'))return;
    var s=document.createElement('style');s.id='processGuardCss';s.textContent='.process-guard-modal{position:fixed;inset:0;background:rgba(17,24,39,.58);z-index:140;display:flex;align-items:center;justify-content:center;padding:14px}.process-guard-modal.hidden{display:none}.process-guard-card{width:min(720px,100%);background:#fff;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.process-guard-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:10px}.process-guard-head h2{margin:0}.process-guard-head p{margin:4px 0 0;color:#6b7280;font-size:13px;line-height:1.45}.process-guard-close{border:0;background:#f3f4f6;border-radius:999px;width:38px;height:38px;font-size:24px;cursor:pointer}.process-guard-list{display:grid;gap:8px}.process-guard-item{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:12px;padding:9px;font-size:13px;line-height:1.45}.process-guard-item.block{border-color:#fecaca;background:#fef2f2;color:#991b1b}.process-guard-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}.process-guard-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 13px;font-size:13px;font-weight:900;cursor:pointer}.process-guard-actions .primary{background:#111827;color:#fff}.process-guard-actions .danger{background:#991b1b;color:#fff}@media(max-width:560px){.process-guard-actions button{flex:1}}';document.head.appendChild(s)
  }
  function ensureModal(){
    css();
    if(e('processGuardModal'))return;
    document.body.insertAdjacentHTML('beforeend','<div id="processGuardModal" class="process-guard-modal hidden"><div class="process-guard-card"><div class="process-guard-head"><div><h2 id="pgTitle">Проверка бизнес-процесса</h2><p id="pgSub">CRM нашла условия, которые могут сорвать заказ или привести к потере денег.</p></div><button id="pgClose" class="process-guard-close" type="button">×</button></div><div id="pgList" class="process-guard-list"></div><div class="process-guard-actions"><button id="pgCancel" type="button">Отмена</button><button id="pgContinue" type="button" class="primary">Продолжить</button></div></div></div>');
    e('pgClose').onclick=close;
    e('pgCancel').onclick=close;
    e('processGuardModal').addEventListener('click',function(ev){if(ev.target===e('processGuardModal'))close()});
  }
  function close(){var m=e('processGuardModal');if(m)m.classList.add('hidden')}
  function confirmIssues(opts){
    ensureModal();opts=opts||{};
    return new Promise(function(resolve){
      var issues=opts.issues||[];
      if(!issues.length){resolve(true);return}
      e('pgTitle').textContent=opts.title||'Проверка бизнес-процесса';
      e('pgSub').textContent=opts.subtitle||'Есть предупреждения перед выполнением действия.';
      var hasBlock=issues.some(function(x){return x.block});
      e('pgList').innerHTML=issues.map(function(x){return '<div class="process-guard-item '+(x.block?'block':'')+'">'+h(x.text)+'</div>'}).join('');
      var cont=e('pgContinue');
      cont.textContent=hasBlock?'Понимаю, всё равно продолжить':'Продолжить';
      cont.className=hasBlock?'danger':'primary';
      var done=false;
      function finish(v){if(done)return;done=true;close();resolve(v)}
      e('pgCancel').onclick=function(){finish(false)};
      e('pgClose').onclick=function(){finish(false)};
      cont.onclick=function(){finish(true)};
      e('processGuardModal').classList.remove('hidden');
    })
  }
  async function fetchOrder(orderId){var r=await window.db.from('leader_orders').select('*').eq('id',orderId).single();if(r.error)throw new Error(r.error.message);return r.data}
  async function fetchPayments(orderId){var r=await window.db.from('leader_payments').select('*').eq('order_id',orderId);return r.error?[]:(r.data||[])}
  async function fetchDesign(orderId){var r=await window.db.from('leader_design_tasks').select('*').eq('order_id',orderId);return r.error?[]:(r.data||[])}
  async function fetchProduction(orderId){var r=await window.db.from('leader_production_jobs').select('*').eq('order_id',orderId);return r.error?[]:(r.data||[])}
  async function fetchInstallation(orderId){var r=await window.db.from('leader_installation_jobs').select('*').eq('order_id',orderId);return r.error?[]:(r.data||[])}
  function paid(payments,order){var p=(payments||[]).reduce(function(a,x){var amount=n(x.amount);if(x.payment_type==='Расход')return a;if(x.payment_type==='Возврат'||String(x.finance_category||'').toLowerCase().indexOf('возврат')>=0)return a-amount;return a+amount},0);return p||n(order.prepayment)}
  async function context(orderId){await needLogin();var order=await fetchOrder(orderId);var payments=await fetchPayments(orderId);var design=await fetchDesign(orderId);var production=await fetchProduction(orderId);var installation=await fetchInstallation(orderId);return {order:order,payments:payments,design:design,production:production,installation:installation,paid:paid(payments,order),balance:Math.max(0,n(order.client_total)-paid(payments,order))}}
  function designReady(ctx){return (ctx.design||[]).some(function(t){return ['Готова','Согласована','Передана в производство'].indexOf(t.task_status)>=0||['Согласован','Готовый файл'].indexOf(t.layout_status)>=0})||['Согласован','Готовый файл'].indexOf(ctx.order.layout_status)>=0}
  function designNeeded(ctx){var txt=[ctx.order.layout_status,ctx.order.layout_comment,ctx.order.internal_comment,ctx.order.public_comment,ctx.order.project_name].join(' ').toLowerCase();return !!ctx.design.length||/дизайн|макет|верст|вёрст/.test(txt)}
  function productionReady(ctx){return (ctx.production||[]).some(function(j){return ['Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(j.production_status)>=0})||['Готов','Получен','Выдан клиенту','Монтаж выполнен'].indexOf(ctx.order.production_status)>=0}
  function installationDone(ctx){return (ctx.installation||[]).some(function(j){return ['Выполнен','Клиент принял','Закрыт'].indexOf(j.install_status)>=0})||ctx.order.installation_status==='Выполнен'||!!ctx.order.installation_completed_at}
  function productionIssues(ctx){
    var issues=[];
    if(n(ctx.order.client_total)<=0)issues.push({block:true,text:'Цена клиенту равна 0 ₽. Нельзя передавать заказ в производство без корректной суммы.'});
    if(ctx.paid<=0)issues.push({block:false,text:'По заказу нет предоплаты. Риск: производство будет запущено без денег от клиента.'});
    if(designNeeded(ctx)&&!designReady(ctx))issues.push({block:false,text:'Макет ещё не согласован. Риск: подрядчик изготовит заказ по неподтверждённому макету.'});
    if(n(ctx.order.profit)<0)issues.push({block:false,text:'Плановая прибыль отрицательная: '+money(ctx.order.profit)+'. Проверьте расчёт перед запуском.'});
    return issues;
  }
  function installationIssues(ctx){
    var issues=[];
    if(n(ctx.order.client_total)<=0)issues.push({block:true,text:'Цена клиенту равна 0 ₽. Нельзя назначать монтаж без корректной суммы заказа.'});
    if(!productionReady(ctx))issues.push({block:false,text:'Производство ещё не отмечено как готовое/полученное. Риск: монтажник приедет без готового изделия.'});
    if(ctx.balance>0)issues.push({block:false,text:'По заказу есть остаток оплаты: '+money(ctx.balance)+'. Перед монтажом лучше получить доплату или согласовать исключение.'});
    if(!ctx.order.installation_address)issues.push({block:false,text:'В заказе не указан адрес монтажа. После создания монтажного задания обязательно заполните адрес.'});
    return issues;
  }
  function issueIssues(ctx){
    var issues=[];
    if(ctx.balance>0)issues.push({block:true,text:'Есть остаток оплаты: '+money(ctx.balance)+'. Нельзя выдавать/закрывать заказ без полной оплаты без решения руководителя.'});
    if(designNeeded(ctx)&&!designReady(ctx))issues.push({block:false,text:'Макет не отмечен как согласованный.'});
    if(ctx.installation.length&&!installationDone(ctx))issues.push({block:false,text:'Монтажное задание ещё не завершено.'});
    return issues;
  }
  function wrapProduction(){
    if(wrapped.production||!window.LeaderV2Production||!window.LeaderV2Production.createFromOrder)return;
    var original=window.LeaderV2Production.createFromOrder;
    window.LeaderV2Production.createFromOrder=async function(orderId,openAfter){
      var ctx=await context(orderId);
      var ok=await confirmIssues({title:'Передать заказ в производство?',subtitle:'Проверка оплаты, макета и прибыльности перед запуском производства.',issues:productionIssues(ctx)});
      if(!ok)throw new Error('Создание производства отменено');
      return original.call(window.LeaderV2Production,orderId,openAfter);
    };
    wrapped.production=true;
  }
  function wrapInstallation(){
    if(wrapped.installation||!window.LeaderV2Installation||!window.LeaderV2Installation.createFromOrder)return;
    var original=window.LeaderV2Installation.createFromOrder;
    window.LeaderV2Installation.createFromOrder=async function(orderId,openAfter){
      var ctx=await context(orderId);
      var ok=await confirmIssues({title:'Создать монтажное задание?',subtitle:'Проверка готовности производства, оплаты и адреса перед монтажом.',issues:installationIssues(ctx)});
      if(!ok)throw new Error('Создание монтажа отменено');
      return original.call(window.LeaderV2Installation,orderId,openAfter);
    };
    wrapped.installation=true;
  }
  async function guardIssueAction(orderId,label){
    var ctx=await context(orderId);
    var issues=issueIssues(ctx);
    if(!issues.length)return true;
    return confirmIssues({title:'Проверка перед действием: '+label,subtitle:'CRM нашла риски перед выдачей или закрытием заказа.',issues:issues});
  }
  function interceptOrderStatus(){
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('button');
      if(!btn)return;
      var text=String(btn.textContent||'').trim().toLowerCase();
      if(!/(выдать|выдан|закрыть|закрыт)/.test(text))return;
      var card=btn.closest('.work-item[data-order]');
      if(!card||btn.dataset.processGuardChecked)return;
      ev.preventDefault();ev.stopPropagation();
      btn.dataset.processGuardChecked='1';
      guardIssueAction(card.dataset.order,btn.textContent||'действие').then(function(ok){
        if(ok){setTimeout(function(){btn.click();btn.dataset.processGuardChecked=''},30)}else btn.dataset.processGuardChecked='';
      }).catch(function(err){btn.dataset.processGuardChecked='';alert(err.message||err)});
    },true);
  }
  function enhanceCards(){
    document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){
      var detail=card.querySelector('.order-detail');if(!detail||detail.dataset.guardBadge)return;
      detail.dataset.guardBadge='1';
      var actions=detail.querySelector('.order-detail-actions');if(!actions)return;
      var b=document.createElement('button');b.type='button';b.textContent='Проверить риски';b.onclick=function(){context(card.dataset.order).then(function(ctx){var issues=[].concat(productionIssues(ctx),installationIssues(ctx),issueIssues(ctx));if(!issues.length)issues.push({block:false,text:'Критичных рисков не найдено. Заказ можно вести по стандартному сценарию.'});confirmIssues({title:'Риски по заказу',subtitle:'Проверка производства, монтажа, оплаты и закрытия.',issues:issues})}).catch(function(err){alert(err.message||err)})};actions.appendChild(b);
    })
  }
  function boot(){css();interceptOrderStatus();var timer=setInterval(function(){wrapProduction();wrapInstallation();enhanceCards();if(wrapped.production&&wrapped.installation){}},700);setTimeout(function(){clearInterval(timer);wrapProduction();wrapInstallation();enhanceCards()},12000);var box=e('ordersList');if(box&&window.MutationObserver){var mo=new MutationObserver(function(){wrapProduction();wrapInstallation();enhanceCards()});mo.observe(box,{childList:true,subtree:true})}}
  window.LeaderV2ProcessGuard={context:context,confirmIssues:confirmIssues,productionIssues:productionIssues,installationIssues:installationIssues,issueIssues:issueIssues,enhance:enhanceCards};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
