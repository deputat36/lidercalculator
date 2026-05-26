(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  function textOf(row){return [row.type,row.item_type,row.name,row.category,row.comment,row.unit,JSON.stringify(row.data||{})].join(' ').toLowerCase()}
  function hasDesign(rows){return (rows||[]).some(function(r){var t=textOf(r);return /дизайн|макет|верст|вёрст|banner_design/.test(t)})}
  function hasInstall(rows){return (rows||[]).some(function(r){var t=textOf(r);return /монтаж|установка|поклейка|наклейка\s+на\s+месте|banner_mount/.test(t)})}
  function hasProduction(rows){return (rows||[]).some(function(r){var t=textOf(r);if(/дизайн|макет|монтаж|доставка/.test(t)&&!/баннер|печать|производ|изготов|плен|плён|таблич|вывес/.test(t))return false;return /изготов|производ|печать|баннер|наклей|плен|плён|таблич|вывес|люверс|проклей|пвх|оракал/.test(t)})}
  function css(){
    if(e('postOrderFlowCss'))return;
    var s=document.createElement('style');s.id='postOrderFlowCss';s.textContent='.post-flow-modal{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:120;display:flex;align-items:center;justify-content:center;padding:14px}.post-flow-modal.hidden{display:none}.post-flow-card{width:min(760px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.post-flow-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:10px}.post-flow-head h2{margin:0}.post-flow-head p{margin:4px 0 0;color:#6b7280;font-size:13px;line-height:1.45}.post-flow-close{border:0;background:#f3f4f6;border-radius:999px;width:38px;height:38px;font-size:24px;cursor:pointer}.post-flow-options{display:grid;gap:8px}.post-flow-option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:#f9fafb;border-radius:14px;padding:10px}.post-flow-option input{width:auto;margin-top:3px}.post-flow-option b{display:block}.post-flow-option span{display:block;color:#6b7280;font-size:12px;line-height:1.4;margin-top:3px}.post-flow-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;justify-content:flex-end}.post-flow-actions button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:9px 13px;font-size:13px;font-weight:900;cursor:pointer}.post-flow-actions .primary{background:#111827;color:#fff}.post-flow-log{margin-top:10px;border:1px solid var(--line);border-radius:12px;background:#f9fafb;padding:10px;font-size:13px;line-height:1.45;white-space:pre-wrap}.post-flow-warning{margin:10px 0;padding:9px 10px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:13px;line-height:1.45}@media(max-width:560px){.post-flow-actions button{flex:1}.post-flow-option{align-items:flex-start}}';document.head.appendChild(s)
  }
  function ensureModal(){
    css();
    if(e('postOrderFlowModal'))return;
    document.body.insertAdjacentHTML('beforeend','<div id="postOrderFlowModal" class="post-flow-modal hidden"><div class="post-flow-card"><div class="post-flow-head"><div><h2>Заказ создан. Что создать дальше?</h2><p id="postFlowSubtitle">CRM нашла связанные этапы по позициям расчёта.</p></div><button id="postFlowClose" class="post-flow-close" type="button">×</button></div><div id="postFlowWarn" class="post-flow-warning hidden"></div><div class="post-flow-options"><label class="post-flow-option"><input id="pfDesign" type="checkbox"><div><b>Дизайн-задача</b><span>Создать ТЗ дизайнеру, если в расчёте есть дизайн/макет или заказ требует подготовки макета.</span></div></label><label class="post-flow-option"><input id="pfProduction" type="checkbox"><div><b>Производственное задание</b><span>Передать позиции изготовления подрядчику/в производство и сформировать ТЗ.</span></div></label><label class="post-flow-option"><input id="pfInstallation" type="checkbox"><div><b>Монтажное задание</b><span>Назначить монтаж, адрес, монтажника и сформировать ТЗ монтажнику.</span></div></label></div><div id="postFlowLog" class="post-flow-log hidden"></div><div class="post-flow-actions"><button id="postFlowSkip" type="button">Позже</button><button id="postFlowCreate" type="button" class="primary">Создать выбранные задачи</button></div></div></div>');
    e('postFlowClose').onclick=close;
    e('postFlowSkip').onclick=close;
    e('postOrderFlowModal').addEventListener('click',function(ev){if(ev.target===e('postOrderFlowModal'))close()});
  }
  function close(){var m=e('postOrderFlowModal');if(m)m.classList.add('hidden')}
  function setLog(text){var x=e('postFlowLog');if(!x)return;x.classList.remove('hidden');x.textContent=text}
  function setWarn(text){var x=e('postFlowWarn');if(!x)return;if(text){x.classList.remove('hidden');x.textContent=text}else{x.classList.add('hidden');x.textContent=''}}
  async function callCreator(name, fn, orderId){
    if(!fn)throw new Error('Модуль «'+name+'» ещё не загрузился. Обновите страницу и попробуйте снова.');
    await fn(orderId,false);
    return '✓ '+name+' создано';
  }
  async function createSelected(orderId){
    var log=[];setLog('Создаю выбранные задачи...');
    try{
      if(e('pfDesign')&&e('pfDesign').checked){log.push(await callCreator('Дизайн-задача',window.LeaderV2DesignTasks&&window.LeaderV2DesignTasks.createFromOrder,orderId));}
      if(e('pfProduction')&&e('pfProduction').checked){log.push(await callCreator('Производственное задание',window.LeaderV2Production&&window.LeaderV2Production.createFromOrder,orderId));}
      if(e('pfInstallation')&&e('pfInstallation').checked){log.push(await callCreator('Монтажное задание',window.LeaderV2Installation&&window.LeaderV2Installation.createFromOrder,orderId));}
      if(!log.length)log.push('Ничего не выбрано. Связанные задачи можно создать позже из карточки заказа.');
      setLog(log.join('\n'));
      toast('Связанные задачи обработаны');
      if(window.LeaderV2Orders&&window.LeaderV2Orders.load)window.LeaderV2Orders.load(true).catch(function(){});
      if(window.LeaderV2ManagerDashboard&&window.LeaderV2ManagerDashboard.load)window.LeaderV2ManagerDashboard.load(true).catch(function(){});
    }catch(err){log.push('⚠ '+(err.message||err));setLog(log.join('\n'))}
  }
  function show(order,rows,ctx){
    ensureModal();
    rows=rows||[];
    var needDesign=hasDesign(rows)||/нужен дизайн|макета нет|макет/i.test((ctx&&ctx.layout_status)||'');
    var needProduction=hasProduction(rows);
    var needInstallation=hasInstall(rows);
    if(!needDesign&&!needProduction&&!needInstallation){
      toast('Заказ создан. Связанные задачи не требуются по позициям расчёта.');
      return;
    }
    e('pfDesign').checked=!!needDesign;
    e('pfProduction').checked=!!needProduction;
    e('pfInstallation').checked=!!needInstallation;
    setLog('');var logBox=e('postFlowLog');if(logBox)logBox.classList.add('hidden');
    setWarn(needDesign&&!(window.LeaderV2DesignTasks&&window.LeaderV2DesignTasks.createFromOrder)||needProduction&&!(window.LeaderV2Production&&window.LeaderV2Production.createFromOrder)||needInstallation&&!(window.LeaderV2Installation&&window.LeaderV2Installation.createFromOrder)?'Некоторые модули ещё загружаются. Если создание не сработает, подождите пару секунд или обновите страницу.':'');
    var subtitle=e('postFlowSubtitle');if(subtitle)subtitle.textContent='Заказ: '+((order&&order.order_number)||((order&&order.id)?String(order.id).slice(0,8):'создан'))+'. Найдены этапы: '+[['дизайн',needDesign],['производство',needProduction],['монтаж',needInstallation]].filter(function(x){return x[1]}).map(function(x){return x[0]}).join(', ')+'.';
    e('postFlowCreate').onclick=function(){createSelected(order.id)};
    e('postOrderFlowModal').classList.remove('hidden');
  }
  window.LeaderV2PostOrderFlow={show:show,handleCreatedOrder:show,detect:{hasDesign:hasDesign,hasProduction:hasProduction,hasInstall:hasInstall}};
})();
