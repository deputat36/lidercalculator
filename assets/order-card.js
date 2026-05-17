(function(){
  function el(id){return document.getElementById(id)}
  function get(key, fallback){try{return JSON.parse(localStorage.getItem('lc_'+key))||fallback}catch(e){return fallback}}
  function set(key, value){localStorage.setItem('lc_'+key, JSON.stringify(value))}
  function rub(v){v=parseFloat(v||0)||0;return Math.round(v).toLocaleString('ru-RU')+' ₽'}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
  function now(){return new Date().toLocaleString('ru-RU')}
  function toast(msg){var t=el('toast'); if(!t){alert(msg);return} t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
  function orders(){return get('orders',[])}
  function saveOrders(list){set('orders',list)}
  function oid(order,index){if(!order.local_id) order.local_id=Date.now()+index; return String(order.cloud_id||order.local_id||index)}
  function commentsKey(order,index){return 'order_comments_'+oid(order,index)}
  function paymentsKey(order,index){return 'order_payments_'+oid(order,index)}
  function historyKey(order,index){return 'order_history_'+oid(order,index)}
  function getComments(o,i){return get(commentsKey(o,i),[])}
  function getPayments(o,i){return get(paymentsKey(o,i),[])}
  function getHistory(o,i){return get(historyKey(o,i),[])}
  function setComments(o,i,v){set(commentsKey(o,i),v)}
  function setPayments(o,i,v){set(paymentsKey(o,i),v)}
  function setHistory(o,i,v){set(historyKey(o,i),v)}
  function calcPaid(order,index){return getPayments(order,index).filter(p=>p.status!=='Отменён').reduce((a,p)=>a+(parseFloat(p.amount)||0),0)}
  function ensureModal(){
    if(el('orderCardBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="orderCardBackdrop" class="oc-backdrop"><div class="oc-modal"><div class="oc-head"><div><div id="ocTitle" class="oc-title">Карточка заказа</div><div id="ocSub" class="oc-note"></div></div><button class="oc-close" onclick="LeaderOrderCard.close()">Закрыть</button></div><div id="ocBody"></div></div></div>');
  }
  function updateLocalOrder(index, patch){var list=orders();Object.assign(list[index],patch);saveOrders(list);if(window.renderOrders) window.renderOrders();}
  function addHistory(order,index,oldStatus,newStatus,comment){var h=getHistory(order,index);h.unshift({date:now(),old_status:oldStatus||'',new_status:newStatus||'',comment:comment||''});setHistory(order,index,h)}
  function statusOptions(current){var arr=['Новый','КП отправлено','Согласовано','Передано подрядчику','В работе','Готов','Выдан','Оплачено','Отменён'];return arr.map(s=>'<option '+(s===current?'selected':'')+'>'+s+'</option>').join('')}
  function paymentStatusOptions(current){var arr=['Не оплачено','Предоплата','Оплачено полностью','Долг'];return arr.map(s=>'<option '+(s===current?'selected':'')+'>'+s+'</option>').join('')}
  function render(order,index){
    ensureModal();
    var paid=calcPaid(order,index); var total=parseFloat(order.total||0)||0; var debt=Math.max(0,total-paid-(parseFloat(order.prepayment||0)||0));
    el('ocTitle').textContent='Заказ '+(order.order_number?('#'+order.order_number):'')+' — '+(order.project||'Без названия');
    el('ocSub').textContent='Клиент: '+(order.client||'—')+' • '+(order.phone||'—')+' • создан: '+(order.date||'—');
    var items=(order.rows||[]).map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.unit)+'</td><td class="right">'+esc(r.qty)+'</td><td class="right">'+rub(r.price)+'</td><td>'+esc(r.comment||'')+'</td></tr>').join('');
    var pays=getPayments(order,index).map((p,i)=>'<tr><td>'+esc(p.date)+'</td><td class="right">'+rub(p.amount)+'</td><td>'+esc(p.method||'')+'</td><td>'+esc(p.status||'Проведён')+'</td><td>'+esc(p.comment||'')+'</td><td class="no-print"><button onclick="LeaderOrderCard.deletePayment('+index+','+i+')" class="small danger">×</button></td></tr>').join('') || '<tr><td colspan="6" class="oc-note">Оплат пока нет</td></tr>';
    var comm=getComments(order,index).map((c,i)=>'<tr><td>'+esc(c.date)+'</td><td>'+esc(c.type)+'</td><td>'+esc(c.body)+'</td><td class="no-print"><button onclick="LeaderOrderCard.deleteComment('+index+','+i+')" class="small danger">×</button></td></tr>').join('') || '<tr><td colspan="4" class="oc-note">Комментариев пока нет</td></tr>';
    var hist=getHistory(order,index).map(h=>'<tr><td>'+esc(h.date)+'</td><td>'+esc(h.old_status)+'</td><td>'+esc(h.new_status)+'</td><td>'+esc(h.comment||'')+'</td></tr>').join('') || '<tr><td colspan="4" class="oc-note">История пока пустая</td></tr>';
    el('ocBody').innerHTML=`
      <div class="oc-kpi">
        <div class="oc-box"><span class="oc-note">Сумма заказа</span><b>${rub(total)}</b></div>
        <div class="oc-box"><span class="oc-note">Оплачено по истории</span><b class="oc-paid">${rub(paid)}</b></div>
        <div class="oc-box"><span class="oc-note">Предоплата в заказе</span><b>${rub(order.prepayment||0)}</b></div>
        <div class="oc-box"><span class="oc-note">Остаток</span><b class="${debt>0?'oc-debt':'oc-paid'}">${rub(debt)}</b></div>
      </div>
      <div class="oc-tabs no-print"><button class="oc-tab active" data-pane="main">Основное</button><button class="oc-tab" data-pane="items">Позиции</button><button class="oc-tab" data-pane="payments">Оплаты</button><button class="oc-tab" data-pane="comments">Комментарии</button><button class="oc-tab" data-pane="history">История</button></div>
      <div id="pane-main" class="oc-pane active">
        <div class="oc-grid">
          <div class="oc-box" style="grid-column:span 4"><b>Клиент</b><input id="ocClient" value="${esc(order.client||'')}"></div>
          <div class="oc-box" style="grid-column:span 3"><b>Телефон</b><input id="ocPhone" value="${esc(order.phone||'')}"></div>
          <div class="oc-box" style="grid-column:span 3"><b>Срок</b><input id="ocDeadline" type="date" value="${esc(order.deadline||'')}"></div>
          <div class="oc-box" style="grid-column:span 2"><b>Статус</b><select id="ocStatus">${statusOptions(order.status||'Новый')}</select></div>
          <div class="oc-box" style="grid-column:span 3"><b>Оплата</b><select id="ocPaymentStatus">${paymentStatusOptions(order.payment_status||'Не оплачено')}</select></div>
          <div class="oc-box" style="grid-column:span 3"><b>Источник</b><input id="ocSource" value="${esc((order.info&&order.info.source)||order.source||'')}"></div>
          <div class="oc-box" style="grid-column:span 6"><b>Комментарий</b><textarea id="ocOrderComment" rows="3">${esc((order.info&&order.info.comment)||'')}</textarea></div>
        </div>
        <div class="oc-actions no-print"><button class="primary" onclick="LeaderOrderCard.saveMain(${index})">Сохранить изменения</button><button onclick="LeaderOrderCard.printReceipt(${index})">Квитанция</button><button onclick="LeaderOrderCard.printTask(${index})">Производственный лист</button><button onclick="LeaderOrderCard.copyBrief(${index})">Скопировать сводку</button></div>
      </div>
      <div id="pane-items" class="oc-pane"><div class="table"><table><thead><tr><th>#</th><th>Позиция</th><th>Ед.</th><th class="right">Кол-во</th><th class="right">Цена</th><th>Комментарий</th></tr></thead><tbody>${items||'<tr><td colspan="6">Позиций нет</td></tr>'}</tbody></table></div></div>
      <div id="pane-payments" class="oc-pane"><div class="oc-formline no-print"><input id="ocPayAmount" style="grid-column:span 3" placeholder="Сумма"><select id="ocPayMethod" style="grid-column:span 3"><option>Наличные</option><option>СБП</option><option>Карта</option><option>Расчётный счёт</option></select><input id="ocPayComment" style="grid-column:span 4" placeholder="Комментарий"><button style="grid-column:span 2" onclick="LeaderOrderCard.addPayment(${index})">Добавить</button></div><div class="table"><table><thead><tr><th>Дата</th><th class="right">Сумма</th><th>Способ</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead><tbody>${pays}</tbody></table></div></div>
      <div id="pane-comments" class="oc-pane"><div class="oc-formline no-print"><select id="ocCommentType" style="grid-column:span 3"><option>internal</option><option>client</option><option>contractor</option><option>production</option></select><input id="ocCommentBody" style="grid-column:span 7" placeholder="Комментарий"><button style="grid-column:span 2" onclick="LeaderOrderCard.addComment(${index})">Добавить</button></div><div class="table"><table><thead><tr><th>Дата</th><th>Тип</th><th>Комментарий</th><th></th></tr></thead><tbody>${comm}</tbody></table></div></div>
      <div id="pane-history" class="oc-pane"><div class="table"><table><thead><tr><th>Дата</th><th>Было</th><th>Стало</th><th>Комментарий</th></tr></thead><tbody>${hist}</tbody></table></div></div>`;
    el('orderCardBackdrop').classList.add('show');
    document.querySelectorAll('.oc-tab').forEach(btn=>btn.onclick=function(){document.querySelectorAll('.oc-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.oc-pane').forEach(x=>x.classList.remove('active'));btn.classList.add('active');el('pane-'+btn.dataset.pane).classList.add('active')});
  }
  async function cloudPayment(order,p){try{if(!window.db||!order.cloud_id)return;await window.db.from('leader_payments').insert({order_id:order.cloud_id,amount:parseFloat(p.amount)||0,method:p.method,payment_status:p.status||'Проведён',comment:p.comment||''})}catch(e){console.warn(e)}}
  async function cloudComment(order,c){try{if(!window.db||!order.cloud_id)return;await window.db.from('leader_order_comments').insert({order_id:order.cloud_id,comment_type:c.type,body:c.body})}catch(e){console.warn(e)}}
  window.LeaderOrderCard={
    open:function(index){var list=orders();render(list[index],index)},
    close:function(){el('orderCardBackdrop').classList.remove('show')},
    saveMain:function(index){var list=orders(),o=list[index],old=o.status;o.client=el('ocClient').value;o.phone=el('ocPhone').value;o.deadline=el('ocDeadline').value;o.status=el('ocStatus').value;o.payment_status=el('ocPaymentStatus').value;o.info=o.info||{};o.info.source=el('ocSource').value;o.info.comment=el('ocOrderComment').value;if(old!==o.status)addHistory(o,index,old,o.status,'Из карточки заказа');saveOrders(list);if(window.updateCloudOrder) window.updateCloudOrder(o);render(o,index);toast('Карточка сохранена')},
    addPayment:function(index){var list=orders(),o=list[index],amount=parseFloat(el('ocPayAmount').value.replace(',','.'))||0;if(amount<=0)return alert('Укажите сумму оплаты');var p={date:now(),amount,method:el('ocPayMethod').value,status:'Проведён',comment:el('ocPayComment').value};var ps=getPayments(o,index);ps.unshift(p);setPayments(o,index,ps);cloudPayment(o,p);render(o,index);toast('Оплата добавлена')},
    deletePayment:function(index,pindex){var list=orders(),o=list[index],ps=getPayments(o,index);ps.splice(pindex,1);setPayments(o,index,ps);render(o,index)},
    addComment:function(index){var list=orders(),o=list[index],body=el('ocCommentBody').value.trim();if(!body)return;var c={date:now(),type:el('ocCommentType').value,body};var cs=getComments(o,index);cs.unshift(c);setComments(o,index,cs);cloudComment(o,c);render(o,index);toast('Комментарий добавлен')},
    deleteComment:function(index,cindex){var list=orders(),o=list[index],cs=getComments(o,index);cs.splice(cindex,1);setComments(o,index,cs);render(o,index)},
    printReceipt:function(index){var list=orders(),o=list[index],paid=calcPaid(o,index)+(parseFloat(o.prepayment)||0),debt=Math.max(0,(parseFloat(o.total)||0)-paid);var html='<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:7px}.right{text-align:right}</style></head><body><h2>РА «Лидер»</h2><h3>Подтверждение заказа '+esc(o.order_number?('#'+o.order_number):'')+'</h3><p><b>Клиент:</b> '+esc(o.client||'')+' '+esc(o.phone||'')+'</p><p><b>Заказ:</b> '+esc(o.project||'')+'</p><p><b>Сумма:</b> '+rub(o.total)+'<br><b>Оплачено:</b> '+rub(paid)+'<br><b>Остаток:</b> '+rub(debt)+'</p><p><b>Срок:</b> '+esc(o.deadline||'уточняется')+'</p><p>Стоимость предварительная и может уточняться после проверки макета/ТЗ.</p></body></html>';var w=window.open('','_blank');w.document.write(html);w.document.close();w.print()},
    printTask:function(index){var list=orders(),o=list[index],items=(o.rows||[]).map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.unit)+'</td><td class="right">'+esc(r.qty)+'</td><td>'+esc(r.comment||'')+'</td></tr>').join('');var html='<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:7px}.right{text-align:right}</style></head><body><h2>Производственный лист / ТЗ подрядчику</h2><p><b>Заказ:</b> '+esc(o.project||'')+'</p><p><b>Срок:</b> '+esc(o.deadline||'')+'</p><table><thead><tr><th>#</th><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Комментарий</th></tr></thead><tbody>'+items+'</tbody></table></body></html>';var w=window.open('','_blank');w.document.write(html);w.document.close();w.print()},
    copyBrief:function(index){var o=orders()[index],paid=calcPaid(o,index)+(parseFloat(o.prepayment)||0),debt=Math.max(0,(parseFloat(o.total)||0)-paid);var text='Заказ: '+(o.project||'')+'\nКлиент: '+(o.client||'')+' '+(o.phone||'')+'\nСтатус: '+(o.status||'')+'\nСумма: '+rub(o.total)+'\nОплачено: '+rub(paid)+'\nОстаток: '+rub(debt)+'\nСрок: '+(o.deadline||'уточняется');navigator.clipboard.writeText(text);toast('Сводка скопирована')}
  };
  function enhanceOrders(){
    var old=window.renderOrders;
    window.renderOrders=function(){
      if(old) old();
      document.querySelectorAll('#ordersTbl tbody tr').forEach(function(tr,i){
        var last=tr.querySelector('td:last-child');
        if(last && !last.querySelector('.cardbtn')){var b=document.createElement('button');b.textContent='Карточка';b.className='small cardbtn';b.onclick=function(){LeaderOrderCard.open(i)};last.insertBefore(b,last.firstChild)}
      });
    };
  }
  document.addEventListener('DOMContentLoaded',function(){ensureModal();setTimeout(enhanceOrders,300);setTimeout(function(){if(window.renderOrders)window.renderOrders()},500)});
})();
