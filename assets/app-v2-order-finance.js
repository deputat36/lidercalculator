(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(x){return v||'—'}}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  async function needLogin(){if(!window.db||!window.db.auth)throw new Error('Supabase ещё не готов');var q=await window.db.auth.getSession();if(!q.data||!q.data.session)throw new Error('Сначала войдите в CRM')}
  function css(){
    if(e('orderFinanceCss'))return;
    var s=document.createElement('style');s.id='orderFinanceCss';s.textContent='.order-finance-box{margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.order-finance-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.order-finance-title{font-weight:900;font-size:15px}.order-finance-sub{font-size:12px;color:#6b7280;line-height:1.4;margin-top:3px}.order-finance-actions{display:flex;gap:7px;flex-wrap:wrap}.order-finance-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer}.order-finance-actions .primary{background:#111827;color:#fff}.order-finance-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.order-finance-grid>div{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:9px}.order-finance-grid span{display:block;font-size:11px;font-weight:900;color:#6b7280;margin-bottom:4px}.order-finance-grid b{font-size:14px}.order-finance-grid .bad b{color:#991b1b}.order-finance-grid .good b{color:#166534}.order-finance-warn{margin-top:8px;color:#92400e;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:8px;font-size:12px;line-height:1.4}.order-finance-form{display:none;margin-top:10px;border:1px solid var(--line);border-radius:14px;background:#f9fafb;padding:10px}.order-finance-form.active{display:block}.order-finance-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.order-finance-form-grid label{font-size:12px;font-weight:900;color:#374151}.order-finance-form-grid input,.order-finance-form-grid select,.order-finance-form-grid textarea{margin-top:4px}.order-finance-form-grid .wide{grid-column:1/-1}.order-finance-table{width:100%;border-collapse:collapse;margin-top:10px}.order-finance-table th,.order-finance-table td{padding:7px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.order-finance-table th{font-size:12px;color:#6b7280;font-weight:900}.order-finance-pill{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;background:#f3f4f6}.order-finance-pill.income{background:#dcfce7;color:#166534}.order-finance-pill.expense{background:#fee2e2;color:#991b1b}@media(max-width:960px){.order-finance-grid,.order-finance-form-grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.order-finance-grid,.order-finance-form-grid{grid-template-columns:1fr}.order-finance-actions button{flex:1}.order-finance-table thead{display:none}.order-finance-table,.order-finance-table tbody,.order-finance-table tr,.order-finance-table td{display:block;width:100%}.order-finance-table tr{border:1px solid var(--line);border-radius:12px;margin:8px 0;padding:7px}.order-finance-table td{border:0;padding:5px 0}}';document.head.appendChild(s)
  }
  async function fetchData(orderId){
    await needLogin();
    var or=await window.db.from('leader_orders').select('*').eq('id',orderId).single();
    if(or.error)throw new Error(or.error.message);
    var pr=await window.db.from('leader_payments').select('*').eq('order_id',orderId).order('created_at',{ascending:false});
    return {order:or.data,payments:pr.error?[]:(pr.data||[])};
  }
  function totals(order,payments){
    var income=0, expense=0, refund=0;
    (payments||[]).forEach(function(p){
      var amount=n(p.amount);
      if(p.payment_type==='Расход') expense+=amount;
      else if((p.finance_category||'').toLowerCase().indexOf('возврат')>=0 || p.payment_type==='Возврат') refund+=amount;
      else income+=amount;
    });
    var clientTotal=n(order.client_total), planCost=n(order.contractor_cost), realCost=expense>0?expense:planCost;
    var balance=Math.max(0,clientTotal-income+refund);
    var grossProfit=clientTotal-realCost;
    var factProfit=income-refund-realCost;
    var margin=clientTotal>0?Math.round(grossProfit/clientTotal*100):0;
    var paidPct=clientTotal>0?Math.min(100,Math.round((income-refund)/clientTotal*100)):0;
    return {income:income,expense:expense,refund:refund,clientTotal:clientTotal,planCost:planCost,realCost:realCost,balance:balance,grossProfit:grossProfit,factProfit:factProfit,margin:margin,paidPct:paidPct};
  }
  function categoryDefault(paymentType){
    if(paymentType==='Расход')return 'Расход подрядчику';
    if(paymentType==='Возврат')return 'Возврат клиенту';
    return 'Предоплата';
  }
  function renderForm(box,order,t){
    var form=box.querySelector('.order-finance-form');
    if(!form)return;
    var balance=t.balance;
    form.innerHTML='<div class="order-finance-form-grid"><label>Тип<select id="ofType"><option>Приход</option><option>Расход</option><option>Возврат</option></select></label><label>Категория<select id="ofCategory"><option>Предоплата</option><option>Доплата</option><option>Полная оплата</option><option>Расход подрядчику</option><option>Расход монтажнику</option><option>Расход дизайнеру</option><option>Доставка / такси</option><option>Материалы</option><option>Возврат клиенту</option><option>Другое</option></select></label><label>Сумма<input id="ofAmount" type="number" min="0" step="1" value="'+(balance>0?Math.round(balance):'')+'"></label><label>Метод<select id="ofMethod"><option>Наличные</option><option>Карта</option><option>СБП</option><option>Расчётный счёт</option><option>Другое</option></select></label><label>Этап<select id="ofStage"><option>Заказ</option><option>Предоплата</option><option>Дизайн</option><option>Производство</option><option>Монтаж</option><option>Выдача</option><option>Закрытие</option></select></label><label>Контрагент<input id="ofCounterparty" value="'+h(order.client_name||'')+'"></label><label>Дата<input id="ofDate" type="date" value="'+new Date().toISOString().slice(0,10)+'"></label><label>Чек / номер<input id="ofReceipt"></label><label class="wide">Комментарий<textarea id="ofComment" rows="2"></textarea></label></div><div class="order-finance-actions"><button class="primary" data-finance-action="save-payment">Сохранить платёж</button><button data-finance-action="hide-form">Отмена</button></div>';
    var type=e('ofType'), cat=e('ofCategory');
    if(type&&cat){type.onchange=function(){cat.value=categoryDefault(type.value);if(type.value==='Расход'){e('ofCounterparty').value=order.contractor_name||order.installer_name||'';e('ofStage').value='Производство'}else if(type.value==='Возврат'){e('ofCounterparty').value=order.client_name||'';e('ofStage').value='Закрытие'}else{e('ofCounterparty').value=order.client_name||''}}}
  }
  function paymentRows(payments){
    if(!payments.length)return '<tr><td colspan="7">Платежей пока нет.</td></tr>';
    return payments.map(function(p){var income=p.payment_type!=='Расход'&&p.payment_type!=='Возврат';var pill='<span class="order-finance-pill '+(income?'income':'expense')+'">'+h(p.payment_type||'Приход')+'</span>';return '<tr><td>'+pill+'</td><td><b>'+money(p.amount)+'</b><br><span class="order-finance-sub">'+h(p.finance_category||'')+'</span></td><td>'+h(p.method||'—')+'</td><td>'+h(p.payment_stage||'—')+'</td><td>'+h(p.counterparty_name||'—')+'</td><td>'+h(p.comment||'')+'</td><td>'+dt(p.created_at||p.payment_date)+'</td></tr>'}).join('');
  }
  function renderBox(box,data){
    var order=data.order, payments=data.payments, t=totals(order,payments);
    var warnings=[];
    if(t.balance>0&&['Выдан','Закрыт'].indexOf(order.status)>=0)warnings.push('Заказ выдан/закрыт, но есть остаток оплаты: '+money(t.balance));
    if(t.balance>0&&order.production_status==='Монтаж выполнен')warnings.push('Монтаж выполнен, перед выдачей нужно получить остаток: '+money(t.balance));
    if(t.margin<20)warnings.push('Маржа ниже 20%: '+t.margin+'%');
    if(t.factProfit<0)warnings.push('Фактическая прибыль отрицательная: '+money(t.factProfit));
    var warn=warnings.length?'<div class="order-finance-warn">'+warnings.map(h).join('<br>')+'</div>':'';
    box.__financeData=data;
    box.innerHTML='<div class="order-finance-head"><div><div class="order-finance-title">Финансы заказа 2.0</div><div class="order-finance-sub">Приходы, расходы, остаток, прибыль и контроль выдачи без оплаты.</div></div><div class="order-finance-actions"><button class="primary" data-finance-action="show-income">Принять оплату</button><button data-finance-action="show-expense">Добавить расход</button><button data-finance-action="refresh">Обновить</button></div></div><div class="order-finance-grid"><div><span>Сумма клиенту</span><b>'+money(t.clientTotal)+'</b></div><div class="good"><span>Принято</span><b>'+money(t.income-t.refund)+' ('+t.paidPct+'%)</b></div><div class="bad"><span>Остаток</span><b>'+money(t.balance)+'</b></div><div><span>Расходы / себестоимость</span><b>'+money(t.realCost)+'</b></div><div class="'+(t.factProfit<0?'bad':'good')+'"><span>Факт. прибыль</span><b>'+money(t.factProfit)+'</b></div></div><div class="order-finance-grid" style="margin-top:8px"><div><span>Плановая себестоимость</span><b>'+money(t.planCost)+'</b></div><div><span>Плановая прибыль</span><b>'+money(t.grossProfit)+'</b></div><div><span>Маржа</span><b>'+t.margin+'%</b></div><div><span>Возвраты</span><b>'+money(t.refund)+'</b></div><div><span>Статус оплаты</span><b>'+h(order.payment_status||'—')+'</b></div></div>'+warn+'<div class="order-finance-form"></div><table class="order-finance-table"><thead><tr><th>Тип</th><th>Сумма</th><th>Метод</th><th>Этап</th><th>Контрагент</th><th>Комментарий</th><th>Дата</th></tr></thead><tbody>'+paymentRows(payments)+'</tbody></table>';
  }
  async function updateOrderFinance(order,payments){
    var t=totals(order,payments);
    var status='Не оплачено';
    if(t.clientTotal>0&&t.balance<=0)status='Оплачено полностью';
    else if(t.income>0)status='Предоплата';
    var patch={prepayment:t.income-t.refund,balance:t.balance,profit:t.grossProfit,payment_status:status,updated_at:new Date().toISOString()};
    await window.db.from('leader_orders').update(patch).eq('id',order.id).catch(function(){});
    return patch;
  }
  async function savePayment(card,box){
    var data=box.__financeData;if(!data)return;
    var order=data.order;
    var amount=n(e('ofAmount')&&e('ofAmount').value);
    if(amount<=0)return alert('Укажите сумму больше 0.');
    var user=await window.db.auth.getUser().catch(function(){return {data:{}}});
    var row={order_id:order.id,amount:amount,payment_type:(e('ofType')&&e('ofType').value)||'Приход',finance_category:(e('ofCategory')&&e('ofCategory').value)||null,method:(e('ofMethod')&&e('ofMethod').value)||null,payment_stage:(e('ofStage')&&e('ofStage').value)||null,counterparty_name:(e('ofCounterparty')&&e('ofCounterparty').value)||null,payment_date:(e('ofDate')&&e('ofDate').value)||new Date().toISOString().slice(0,10),receipt_number:(e('ofReceipt')&&e('ofReceipt').value)||null,comment:(e('ofComment')&&e('ofComment').value)||null,created_by:user.data&&user.data.user?user.data.user.id:null,created_by_email:user.data&&user.data.user?user.data.user.email:null,related_entity_type:'order',related_entity_id:order.id,is_confirmed:true};
    var r=await window.db.from('leader_payments').insert(row).select('*').single();
    if(r.error)throw new Error(r.error.message);
    await window.db.from('leader_order_status_history').insert({order_id:order.id,new_status:'Финансы',comment:'Добавлен платёж: '+row.payment_type+' '+money(row.amount)+' • '+(row.finance_category||'')+' • '+(row.payment_stage||'')}).catch(function(){});
    var fresh=await fetchData(order.id);
    await updateOrderFinance(fresh.order,fresh.payments);
    var refreshed=await fetchData(order.id);
    renderBox(box,refreshed);
    toast('Платёж сохранён');
    if(window.LeaderV2OrderTimeline&&window.LeaderV2OrderTimeline.renderForCard)window.LeaderV2OrderTimeline.renderForCard(card,true).catch(function(){});
    if(window.LeaderV2OrderProgress&&window.LeaderV2OrderProgress.enhance)window.LeaderV2OrderProgress.enhance();
    if(window.LeaderV2ManagerDashboard&&window.LeaderV2ManagerDashboard.load)window.LeaderV2ManagerDashboard.load(true).catch(function(){});
  }
  async function renderForCard(card,force){
    css();
    var detail=card.querySelector('.order-detail');if(!detail)return;
    var orderId=card.dataset.order;
    var box=detail.querySelector('.order-finance-box');
    if(!box){box=document.createElement('div');box.className='order-finance-box';var progress=detail.querySelector('.order-progress-box');if(progress)progress.insertAdjacentElement('afterend',box);else detail.insertBefore(box,detail.firstChild)}
    if(box.dataset.loaded&&!force)return;
    box.textContent='Загружаю финансы заказа...';
    try{var data=await fetchData(orderId);box.dataset.loaded='1';renderBox(box,data)}catch(err){box.innerHTML='<div class="order-finance-warn">Не удалось загрузить финансы: '+h(err.message||err)+'</div>'}
  }
  function enhance(){document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){if(card.querySelector('.order-detail'))renderForCard(card,false)})}
  function observe(){
    css();
    var list=e('ordersList');
    if(list&&!list.dataset.financeObserver){if(window.MutationObserver){var mo=new MutationObserver(function(){enhance()});mo.observe(list,{childList:true,subtree:true})}list.dataset.financeObserver='1'}
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-finance-action]');if(!btn)return;
      var card=btn.closest('.work-item[data-order]');var box=btn.closest('.order-finance-box');if(!card||!box)return;
      var action=btn.dataset.financeAction;
      if(action==='refresh'){box.dataset.loaded='';renderForCard(card,true);return}
      if(action==='show-income'||action==='show-expense'){var data=box.__financeData;if(!data)return;renderForm(box,data.order,totals(data.order,data.payments));var form=box.querySelector('.order-finance-form');if(form)form.classList.add('active');setTimeout(function(){var type=e('ofType'), cat=e('ofCategory'), stage=e('ofStage'), amount=e('ofAmount'), counter=e('ofCounterparty');if(action==='show-expense'){if(type)type.value='Расход';if(cat)cat.value='Расход подрядчику';if(stage)stage.value='Производство';if(counter)counter.value=data.order.contractor_name||data.order.installer_name||'';if(amount)amount.value=''}else{if(type)type.value='Приход';if(cat)cat.value=data.order.balance>0&&data.order.prepayment>0?'Доплата':'Предоплата';if(stage)stage.value=data.order.prepayment>0?'Выдача':'Предоплата';if(counter)counter.value=data.order.client_name||''}},0);return}
      if(action==='hide-form'){var f=box.querySelector('.order-finance-form');if(f)f.classList.remove('active');return}
      if(action==='save-payment'){savePayment(card,box).catch(function(err){alert(err.message||err)});return}
    });
    enhance();
  }
  window.LeaderV2OrderFinance={fetch:fetchData,totals:totals,enhance:enhance,renderForCard:renderForCard};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1500)});else setTimeout(observe,1000);
})();
