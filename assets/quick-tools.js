(function(){
  function el(id){return document.getElementById(id)}
  function n(v){v=String(v||'').replace(',','.').replace(/\s+/g,'');var x=parseFloat(v);return isNaN(x)?0:x}
  function toast(s){var t=el('toast'); if(!t){console.log(s);return} t.textContent=s;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2200)}
  function setVal(id,v){if(el(id)){el(id).value=v;el(id).dispatchEvent(new Event('input',{bubbles:true}))}}
  function currentTotals(){return{total:el('sumTotal')?el('sumTotal').textContent:'0 ₽',cost:el('sumCost')?el('sumCost').textContent:'0 ₽',debt:el('sumDebt')?el('sumDebt').textContent:'0 ₽',profit:el('sumProfit')?el('sumProfit').textContent:'0 ₽'}}
  function esc(s){return String(s==null?'':s).replace(/[&<>]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m]})}
  function fmt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(e){return v||'—'}}
  function read(k,d){try{return JSON.parse(localStorage.getItem('lc_'+k))||d}catch(e){return d}}
  function write(k,v){localStorage.setItem('lc_'+k,JSON.stringify(v))}
  function db(){return window.db}

  function addQuickBox(){
    var calc=document.getElementById('calc'); if(!calc || document.getElementById('quickToolsBox')) return;
    var box=document.createElement('div'); box.id='quickToolsBox'; box.className='qt-card no-print';
    box.innerHTML='<div class="qt-title">Быстрые инструменты</div><div class="qt-grid"><div style="grid-column:span 2"><label>Ширина</label><input id="qtW" class="qt-input" placeholder="200"></div><div style="grid-column:span 2"><label>Высота</label><input id="qtH" class="qt-input" placeholder="100"></div><div style="grid-column:span 2"><label>Единицы</label><select id="qtUnit" class="qt-input"><option value="cm">см</option><option value="mm">мм</option><option value="m">м</option></select></div><div style="grid-column:span 2"><label>Количество</label><input id="qtQty" class="qt-input" value="1"></div><div style="grid-column:span 4"><label>&nbsp;</label><button id="qtApplySize" class="primary">Подставить размер</button></div></div><div class="qt-sep"></div><div class="qt-row"><span class="qt-status">Шаблоны:</span><button class="qt-chip" data-template="banner2x1">Баннер 2×1</button><button class="qt-chip" data-template="banner3x1">Баннер 3×1</button><button class="qt-chip" data-template="perfo1x1">Перфоплёнка 1×1</button><button class="qt-chip" data-template="pvc30x20">Табличка 30×20</button><button class="qt-chip" data-template="worktime">Режим работы</button><button class="qt-chip" data-template="design">Дизайн</button><button class="qt-chip" data-template="mount">Монтаж</button></div>';
    calc.insertBefore(box, calc.firstChild);
    document.getElementById('qtApplySize').onclick=applyQuickSize;
    box.querySelectorAll('[data-template]').forEach(function(btn){btn.onclick=function(){applyTemplate(btn.dataset.template)}});
  }
  function applyQuickSize(){
    var w=n(el('qtW').value), h=n(el('qtH').value), q=n(el('qtQty').value||1), u=el('qtUnit').value;
    if(u==='cm'){w=w/100;h=h/100}else if(u==='mm'){w=w/1000;h=h/1000}
    if(w>0) setVal('w', String(w).replace('.',','));
    if(h>0) setVal('h', String(h).replace('.',','));
    if(q>0) setVal('qty', q);
    toast('Размер подставлен');
  }
  function selectItemByText(text){var sel=el('itm'); if(!sel) return false; for(var i=0;i<sel.options.length;i++) if((sel.options[i].text||'').toLowerCase().includes(text.toLowerCase())){sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}));return true} return false}
  function selectCategoryContaining(text){var sel=el('cat'); if(!sel) return false; for(var i=0;i<sel.options.length;i++) if((sel.options[i].text||'').toLowerCase().includes(text.toLowerCase())){sel.selectedIndex=i;sel.dispatchEvent(new Event('change',{bubbles:true}));return true} return false}
  function applyTemplate(name){
    if(name==='banner2x1'){selectCategoryContaining('Широкоформат');selectItemByText('Баннер');setVal('w','2');setVal('h','1');setVal('qty','1'); if(el('hem'))el('hem').checked=true;if(el('luv'))el('luv').checked=true;toast('Шаблон баннера 2×1 подставлен');return}
    if(name==='banner3x1'){selectCategoryContaining('Широкоформат');selectItemByText('Баннер');setVal('w','3');setVal('h','1');setVal('qty','1'); if(el('hem'))el('hem').checked=true;if(el('luv'))el('luv').checked=true;toast('Шаблон баннера 3×1 подставлен');return}
    if(name==='perfo1x1'){selectCategoryContaining('Широкоформат');selectItemByText('Перфор');setVal('w','1');setVal('h','1');setVal('qty','1');toast('Шаблон перфоплёнки подставлен');return}
    if(name==='pvc30x20'){selectCategoryContaining('Пленка');selectItemByText('ПВХ');setVal('w','0,3');setVal('h','0,2');setVal('qty','1');toast('Шаблон таблички подставлен');return}
    if(name==='worktime'){selectCategoryContaining('Пленка');selectItemByText('Самоклеящаяся');setVal('w','0,3');setVal('h','0,4');setVal('qty','1');toast('Шаблон режима работы подставлен');return}
    if(name==='design'){if(window.manual) window.manual('Дизайн');return}
    if(name==='mount'){if(window.manual) window.manual('Монтаж');return}
  }
  function addBottomPanel(){
    var calc=document.getElementById('calc'); if(!calc || document.getElementById('qtBottom')) return;
    var p=document.createElement('div');p.id='qtBottom';p.className='qt-bottom no-print';
    p.innerHTML='<div><div class="qt-muted">Итого клиенту</div><b id="qtTotal">0 ₽</b><div class="qt-muted">Маржа: <span id="qtProfit">0 ₽</span> • Остаток: <span id="qtDebt">0 ₽</span></div></div><div class="qt-actions"><button onclick="printDoc(\'client\')">КП</button><button onclick="copyMax()">MAX</button><button onclick="saveProject()">Сохранить</button><button onclick="createOrder()">Заказ</button></div>';
    calc.appendChild(p);
  }
  function updateBottom(){var t=currentTotals(); if(el('qtTotal')) el('qtTotal').textContent=t.total; if(el('qtProfit')) el('qtProfit').textContent=t.profit; if(el('qtDebt')) el('qtDebt').textContent=t.debt}
  function wrapRenderRows(){var old=window.renderRows;if(typeof old==='function'&&!old._qt){var f=function(){old();updateBottom()};f._qt=true;window.renderRows=f}}

  async function invokeLead(body){
    if(!db()) throw new Error('Нет подключения Supabase');
    var u=await db().auth.getUser();
    if(!u.data.user) throw new Error('Сначала войдите в CRM');
    var r=await db().functions.invoke('leader-crm-leads',{body:body});
    if(r.error) throw new Error(r.error.message || 'Ошибка запроса');
    if(r.data && r.data.error) throw new Error(r.data.error);
    return r.data || {};
  }
  async function loadSiteLeads(){
    var data=await invokeLead({action:'list'});
    var list=data.leads||[];
    write('leads',list);
    drawSiteLeads(list);
    return list;
  }
  function updateLocalLead(id, patch){
    var list=read('leads',[]).map(function(x){return x.id===id?Object.assign({},x,patch):x});
    write('leads',list);
    drawSiteLeads(list);
  }
  async function setLeadStatus(id,status){
    await invokeLead({action:'update',id:id,status:status});
    updateLocalLead(id,{status:status});
    toast('Статус заявки: '+status);
  }
  async function ensureClientFromLead(i){
    var list=read('leads',[]), l=list[i]; if(!l) return;
    var data=await invokeLead({action:'ensure_client',name:l.name,phone:l.phone,source:l.source||'Сайт',comment:(l.service||'')+'\n'+(l.message||'')});
    await setLeadStatus(l.id,'В работе');
    toast((data.existed?'Клиент уже был в базе':'Клиент создан')+': '+(l.name||l.phone||''));
  }
  function leadToCalc(i){
    var list=read('leads',[]), l=list[i]; if(!l) return;
    if(window.applyInfo) window.applyInfo({name:l.name,phone:l.phone,source:l.source||'Сайт',message:l.message,comment:l.message});
    setVal('clientName',l.name||'');
    setVal('clientPhone',l.phone||'');
    if(el('source')) el('source').value='Сайт';
    setVal('orderComment',[(l.service||''),(l.message||'')].filter(Boolean).join(' — '));
    var p=el('projectName'); if(p) p.value='Заявка '+(l.name||l.phone||'с сайта');
    setLeadStatus(l.id,'В работе').catch(function(e){console.warn(e)});
    var tab=document.querySelector('[data-tab="calc"]'); if(tab) tab.click();
  }
  function drawSiteLeads(list){
    list=list||read('leads',[]);
    var tbl=el('leadsTbl'); if(!tbl) return;
    var tb=tbl.querySelector('tbody'); if(!tb) return;
    var f=el('leadFilter'); var fv=f?f.value:'Все';
    var arr=list.filter(function(x){return fv==='Все'||(x.status||'Новая')===fv});
    tb.innerHTML='';
    if(!arr.length){tb.innerHTML='<tr><td colspan="7">Заявок нет</td></tr>';return}
    arr.forEach(function(l){
      var i=list.findIndex(function(x){return x.id===l.id});
      var tr=document.createElement('tr');
      tr.innerHTML='<td>'+fmt(l.created_at)+'</td><td><b>'+esc(l.name||'—')+'</b></td><td>'+esc(l.phone)+'</td><td>'+esc(l.service||l.source)+'</td><td>'+esc(l.message)+'</td><td><select class="lead-status"><option>Новая</option><option>В работе</option><option>Создан заказ</option><option>Отказ</option><option>Спам</option></select></td><td><button class="small to-calc">В расчёт</button> <button class="small make-client">Клиент</button> <button class="small mark-order">Заказ</button> <button class="small mark-spam">Спам</button></td>';
      var sel=tr.querySelector('.lead-status'); sel.value=l.status||'Новая';
      sel.onchange=function(){setLeadStatus(l.id,sel.value).catch(function(e){alert(e.message)})};
      tr.querySelector('.to-calc').onclick=function(){leadToCalc(i)};
      tr.querySelector('.make-client').onclick=function(){ensureClientFromLead(i).catch(function(e){alert(e.message)})};
      tr.querySelector('.mark-order').onclick=function(){setLeadStatus(l.id,'Создан заказ').catch(function(e){alert(e.message)})};
      tr.querySelector('.mark-spam').onclick=function(){setLeadStatus(l.id,'Спам').catch(function(e){alert(e.message)})};
      tb.appendChild(tr);
    });
  }
  function addLeadButton(){
    var sec=el('leads'); if(!sec || el('qtSiteLeadsBtn')) return;
    var row=sec.querySelector('.card .row .row') || sec.querySelector('.card .row') || sec;
    var b=document.createElement('button');
    b.id='qtSiteLeadsBtn';
    b.className='primary';
    b.textContent='Загрузить заявки с сайта';
    b.onclick=async function(){try{var list=await loadSiteLeads();toast('Загружено заявок: '+list.length)}catch(e){alert(e.message)}};
    row.appendChild(b);
  }
  window.LeaderSiteLeads={load:loadSiteLeads,render:function(){drawSiteLeads(read('leads',[]))},setStatus:setLeadStatus,ensureClient:ensureClientFromLead,toCalc:leadToCalc};
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){addQuickBox();addBottomPanel();wrapRenderRows();updateBottom();addLeadButton()},500);
    setInterval(function(){updateBottom();addLeadButton();var f=el('leadFilter');if(f&&!f.dataset.qtLeads){f.dataset.qtLeads='1';f.addEventListener('change',function(){drawSiteLeads(read('leads',[]))})}},1200);
  });
})();
