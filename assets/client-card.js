// Client card module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function rub(v){ v=Number(v||0); return Math.round(v).toLocaleString('ru-RU')+' ₽'; }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  function clientKey(c,i){ return String(c.cloud_id || c.id || c.phone || c.name || i); }
  function interactionsKey(c,i){ return 'client_interactions_'+clientKey(c,i); }
  function getInteractions(c,i){ return read(interactionsKey(c,i), []); }
  function setInteractions(c,i,v){ write(interactionsKey(c,i), v); }
  function ordersForClient(c){
    var phone=String(c.phone||'').trim(), name=String(c.name||'').trim().toLowerCase();
    return read('orders', []).filter(function(o){
      return (phone && String(o.phone||'').trim()===phone) || (name && String(o.client||'').trim().toLowerCase()===name);
    });
  }
  function kpi(c){
    var o=ordersForClient(c);
    return {orders:o.length,revenue:o.reduce((a,x)=>a+Number(x.total||0),0),profit:o.reduce((a,x)=>a+Number(x.profit||0),0),debt:o.reduce((a,x)=>a+Number(x.balance||0),0)};
  }
  function ensureModal(){
    if(document.getElementById('clientCardBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="clientCardBackdrop" class="cc-backdrop"><div class="cc-modal"><div class="cc-head"><div><div id="ccTitle" class="cc-title">Карточка клиента</div><div id="ccSub" class="cc-note"></div></div><button class="cc-close" onclick="LeaderClientCard.close()">Закрыть</button></div><div id="ccBody"></div></div></div>');
  }
  function tabs(){
    document.querySelectorAll('.cc-tab').forEach(function(btn){btn.onclick=function(){document.querySelectorAll('.cc-tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.cc-pane').forEach(function(x){x.classList.remove('active')});btn.classList.add('active');document.getElementById('cc-pane-'+btn.dataset.pane).classList.add('active')}});
  }
  async function cloudInteraction(c, item){
    var client=db(); if(!client) return;
    try{
      var user=await client.auth.getUser(); if(!user.data.user) return;
      await client.rpc('leader_add_client_interaction',{
        p_client_id:c.cloud_id||null,
        p_client_name:c.name||'',
        p_phone:c.phone||'',
        p_interaction_type:item.type||'Заметка',
        p_channel:item.channel||'',
        p_body:item.body||'',
        p_result:item.result||'',
        p_next_action_at:item.next_action_at||null
      });
    }catch(e){ console.warn(e); }
  }
  function render(c,index){
    ensureModal();
    var stat=kpi(c), ord=ordersForClient(c), ints=getInteractions(c,index);
    document.getElementById('ccTitle').textContent=c.name||'Клиент без имени';
    document.getElementById('ccSub').textContent=(c.phone||'телефон не указан')+' • источник: '+(c.source||'—');
    var ordersRows=ord.map(function(o){return '<tr><td>'+esc(o.date||'')+'</td><td>'+esc(o.project||'')+'</td><td>'+esc(o.status||'')+'</td><td class="right">'+rub(o.total)+'</td><td class="right">'+rub(o.balance)+'</td></tr>'}).join('') || '<tr><td colspan="5" class="cc-note">Заказов пока нет</td></tr>';
    var intsRows=ints.map(function(x,i){return '<tr><td>'+esc(x.date||'')+'</td><td>'+esc(x.type||'')+'</td><td>'+esc(x.channel||'')+'</td><td>'+esc(x.body||'')+'</td><td>'+esc(x.result||'')+'</td><td class="no-print"><button class="small danger" onclick="LeaderClientCard.deleteInteraction('+index+','+i+')">×</button></td></tr>'}).join('') || '<tr><td colspan="6" class="cc-note">История общения пока пустая</td></tr>';
    document.getElementById('ccBody').innerHTML=`
      <div class="cc-kpi"><div class="cc-box"><span class="cc-note">Заказов</span><b>${stat.orders}</b></div><div class="cc-box"><span class="cc-note">Выручка</span><b>${rub(stat.revenue)}</b></div><div class="cc-box"><span class="cc-note">Маржа</span><b class="cc-good">${rub(stat.profit)}</b></div><div class="cc-box"><span class="cc-note">Долг</span><b class="${stat.debt>0?'cc-debt':'cc-good'}">${rub(stat.debt)}</b></div></div>
      <div class="cc-tabs no-print"><button class="cc-tab active" data-pane="main">Основное</button><button class="cc-tab" data-pane="orders">Заказы</button><button class="cc-tab" data-pane="history">Общение</button></div>
      <div id="cc-pane-main" class="cc-pane active"><div class="cc-grid"><div class="cc-box" style="grid-column:span 4"><b>Имя / организация</b><input id="ccName" value="${esc(c.name||'')}"></div><div class="cc-box" style="grid-column:span 3"><b>Телефон</b><input id="ccPhone" value="${esc(c.phone||'')}"></div><div class="cc-box" style="grid-column:span 3"><b>Источник</b><input id="ccSource" value="${esc(c.source||'')}"></div><div class="cc-box" style="grid-column:span 6"><b>Адрес</b><input id="ccAddress" value="${esc(c.address||'')}"></div><div class="cc-box" style="grid-column:span 6"><b>Комментарий</b><textarea id="ccComment" rows="3">${esc(c.comment||'')}</textarea></div></div><div class="cc-actions no-print"><button class="primary" onclick="LeaderClientCard.save(${index})">Сохранить</button><button onclick="LeaderClientCard.toCalc(${index})">В расчёт</button><button onclick="LeaderClientCard.print(${index})">Печать карточки</button><button onclick="LeaderClientCard.copy(${index})">Скопировать сводку</button></div></div>
      <div id="cc-pane-orders" class="cc-pane"><div class="table"><table><thead><tr><th>Дата</th><th>Заказ</th><th>Статус</th><th class="right">Сумма</th><th class="right">Остаток</th></tr></thead><tbody>${ordersRows}</tbody></table></div></div>
      <div id="cc-pane-history" class="cc-pane"><div class="cc-formline no-print"><select id="ccInteractionType" style="grid-column:span 2"><option>Звонок</option><option>MAX</option><option>Встреча</option><option>Заметка</option><option>КП</option></select><input id="ccInteractionChannel" style="grid-column:span 2" placeholder="Канал"><input id="ccInteractionBody" style="grid-column:span 5" placeholder="Что обсудили"><input id="ccInteractionResult" style="grid-column:span 2" placeholder="Результат"><button style="grid-column:span 1" onclick="LeaderClientCard.addInteraction(${index})">+</button></div><div class="table"><table><thead><tr><th>Дата</th><th>Тип</th><th>Канал</th><th>Содержание</th><th>Результат</th><th></th></tr></thead><tbody>${intsRows}</tbody></table></div></div>`;
    document.getElementById('clientCardBackdrop').classList.add('show');
    tabs();
  }
  function saveCloudClient(c){
    var client=db(); if(!client || !c.cloud_id) return;
    client.from('leader_clients').update({name:c.name,phone:c.phone,source:c.source,address:c.address,comment:c.comment}).eq('id',c.cloud_id).then(function(r){ if(r.error) console.warn(r.error); });
  }
  window.LeaderClientCard={
    open:function(index){ render(read('clients', [])[index], index); },
    close:function(){ document.getElementById('clientCardBackdrop').classList.remove('show'); },
    save:function(index){ var list=read('clients', []), c=list[index]; c.name=document.getElementById('ccName').value; c.phone=document.getElementById('ccPhone').value; c.source=document.getElementById('ccSource').value; c.address=document.getElementById('ccAddress').value; c.comment=document.getElementById('ccComment').value; write('clients', list); saveCloudClient(c); if(window.renderClients) window.renderClients(); render(c,index); toast('Карточка клиента сохранена'); },
    toCalc:function(index){ var c=read('clients', [])[index]; if(window.applyInfo) window.applyInfo({name:c.name,phone:c.phone,source:c.source,address:c.address,comment:c.comment}); var tab=document.querySelector('[data-tab="calc"]'); if(tab) tab.click(); },
    addInteraction:function(index){ var list=read('clients', []), c=list[index], body=document.getElementById('ccInteractionBody').value.trim(); if(!body) return; var item={date:new Date().toLocaleString('ru-RU'),type:document.getElementById('ccInteractionType').value,channel:document.getElementById('ccInteractionChannel').value,body:body,result:document.getElementById('ccInteractionResult').value}; var arr=getInteractions(c,index); arr.unshift(item); setInteractions(c,index,arr); cloudInteraction(c,item); render(c,index); toast('Контакт добавлен'); },
    deleteInteraction:function(index,itemIndex){ var c=read('clients', [])[index], arr=getInteractions(c,index); arr.splice(itemIndex,1); setInteractions(c,index,arr); render(c,index); },
    print:function(index){ var c=read('clients', [])[index], stat=kpi(c), ord=ordersForClient(c); var rows=ord.map(function(o){return '<tr><td>'+esc(o.date||'')+'</td><td>'+esc(o.project||'')+'</td><td>'+esc(o.status||'')+'</td><td>'+rub(o.total)+'</td></tr>'}).join(''); var html='<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:7px}</style></head><body><h2>Карточка клиента</h2><p><b>'+esc(c.name||'')+'</b><br>'+esc(c.phone||'')+'<br>'+esc(c.address||'')+'</p><p>Заказов: '+stat.orders+'<br>Выручка: '+rub(stat.revenue)+'<br>Маржа: '+rub(stat.profit)+'<br>Долг: '+rub(stat.debt)+'</p><table><thead><tr><th>Дата</th><th>Заказ</th><th>Статус</th><th>Сумма</th></tr></thead><tbody>'+rows+'</tbody></table></body></html>'; var w=window.open('','_blank'); w.document.write(html); w.document.close(); w.print(); },
    copy:function(index){ var c=read('clients', [])[index], stat=kpi(c); var text='Клиент: '+(c.name||'')+'\nТелефон: '+(c.phone||'')+'\nИсточник: '+(c.source||'')+'\nЗаказов: '+stat.orders+'\nВыручка: '+rub(stat.revenue)+'\nДолг: '+rub(stat.debt); navigator.clipboard.writeText(text); toast('Сводка клиента скопирована'); }
  };
  function enhanceClients(){
    var old=window.renderClients;
    if(typeof old==='function' && !old._cc){
      var f=function(){ old(); document.querySelectorAll('#clientsTbl tbody tr').forEach(function(tr,i){ var last=tr.querySelector('td:last-child'); if(last && !last.querySelector('.client-card-btn')){ var b=document.createElement('button'); b.className='small client-card-btn'; b.textContent='Карточка'; b.onclick=function(){LeaderClientCard.open(i)}; last.insertBefore(b,last.firstChild); } }); };
      f._cc=true; window.renderClients=f;
    }
  }
  document.addEventListener('DOMContentLoaded',function(){ ensureModal(); setTimeout(enhanceClients,900); setTimeout(function(){ if(window.renderClients) window.renderClients(); },1200); });
})();
