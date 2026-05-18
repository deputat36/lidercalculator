// Production workflow module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function rub(v){ v=Number(v||0); return Math.round(v).toLocaleString('ru-RU')+' ₽'; }
  function fmt(v){ if(!v) return '—'; try{return new Date(v).toLocaleString('ru-RU')}catch(e){return v} }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  const STATUSES=['Не передано','Макет','Передано подрядчику','В производстве','Готово','Выдано','Проблема','Отменено'];
  const LAYOUT=['Макет не проверен','Макета нет','Нужен дизайн','На согласовании','Согласован','Требует правок','Отправлен подрядчику'];
  const DEFAULT_CONTRACTORS=[{name:'Подрядчик печати',services:'Баннеры, плёнка, широкоформатная печать'},{name:'Монтаж',services:'Монтаж наружной рекламы'}];
  function contractors(){ return read('contractors', DEFAULT_CONTRACTORS); }
  function saveContractors(v){ write('contractors', v); }
  function jobs(){ return read('production_jobs', []); }
  function saveJobs(v){ write('production_jobs', v); }
  function orders(){ return read('orders', []); }
  function statusOptions(current){ return STATUSES.map(function(s){return '<option '+(s===current?'selected':'')+'>'+s+'</option>'}).join(''); }
  function layoutOptions(current){ return LAYOUT.map(function(s){return '<option '+(s===current?'selected':'')+'>'+s+'</option>'}).join(''); }
  function contractorOptions(current){ return contractors().map(function(c,i){return '<option value="'+i+'" '+(String(i)===String(current)?'selected':'')+'>'+esc(c.name)+'</option>'}).join(''); }
  function addTab(){
    if(document.querySelector('[data-tab="production"]')) return;
    var tabs=document.querySelector('.tabs'), wrap=document.querySelector('.wrap'); if(!tabs||!wrap) return;
    var tab=document.createElement('div'); tab.className='tab'; tab.dataset.tab='production'; tab.textContent='Производство'; tabs.appendChild(tab);
    var sec=document.createElement('section'); sec.id='production'; sec.className='page hidden';
    sec.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><div><b>Производство</b><div class="muted">Макеты, подрядчики, сроки готовности и выдача заказов.</div></div><div class="row"><button onclick="LeaderProduction.refresh()">Обновить</button><button onclick="LeaderProduction.loadCloud()">Загрузить облако</button><button onclick="LeaderProduction.openNew()" class="primary">Новая производственная задача</button></div></div><div class="prod-grid" style="margin-top:12px"><div class="prod-card" style="grid-column:span 8"><b>Производственные задачи</b><div id="prodJobs" class="prod-list" style="margin-top:10px"></div></div><div class="prod-card" style="grid-column:span 4"><b>Подрядчики</b><div class="prod-form" style="margin-top:8px"><input id="prodContrName" style="grid-column:span 12" placeholder="Название подрядчика"><input id="prodContrPhone" style="grid-column:span 6" placeholder="Телефон"><input id="prodContrServices" style="grid-column:span 6" placeholder="Услуги"><button style="grid-column:span 12" onclick="LeaderProduction.addContractor()">Добавить подрядчика</button></div><div id="prodContractors" class="prod-list" style="margin-top:10px"></div></div></div></div>';
    wrap.appendChild(sec);
    tab.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden');LeaderProduction.refresh();};
  }
  function ensureModal(){
    if(document.getElementById('prodBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="prodBackdrop" class="prod-backdrop"><div class="prod-modal"><div class="prod-head"><div><div id="prodTitle" class="prod-title">Производственная задача</div><div id="prodSub" class="prod-meta"></div></div><button class="prod-close" onclick="LeaderProduction.close()">Закрыть</button></div><div id="prodBody"></div></div></div>');
  }
  function jobCard(j,i){
    var cls=j.production_status==='Проблема'?'prod-hot':(j.production_status==='Готово'||j.production_status==='Выдано'?'prod-good':'prod-warn');
    return '<div class="prod-card"><b>'+esc(j.title||'Без названия')+'</b><div class="prod-meta">'+esc(j.client_name||'')+' '+esc(j.client_phone||'')+' • срок: '+fmt(j.deadline)+'</div><div><span class="prod-status '+cls+'">'+esc(j.production_status||'Не передано')+'</span> <span class="prod-pill">'+esc(j.layout_status||'Макет не проверен')+'</span> <span class="prod-pill">'+esc(j.contractor_name||'подрядчик не указан')+'</span></div><div class="prod-actions"><button onclick="LeaderProduction.open('+i+')">Карточка</button><button onclick="LeaderProduction.printTask('+i+')">ТЗ</button><button onclick="LeaderProduction.copyBrief('+i+')">Сводка</button></div></div>';
  }
  function renderContractors(){
    var box=document.getElementById('prodContractors'); if(!box) return;
    var list=contractors();
    box.innerHTML=list.length?list.map(function(c,i){return '<div class="prod-card"><b>'+esc(c.name)+'</b><div class="prod-meta">'+esc(c.phone||'')+'</div><div>'+esc(c.services||'')+'</div><div class="prod-actions"><button class="danger" onclick="LeaderProduction.deleteContractor('+i+')">Удалить</button></div></div>';}).join(''):'<div class="prod-empty">Подрядчиков пока нет</div>';
  }
  function renderJobs(){
    var box=document.getElementById('prodJobs'); if(!box) return;
    var list=jobs();
    box.innerHTML=list.length?list.map(jobCard).join(''):'<div class="prod-empty">Производственных задач пока нет. Создайте задачу из заказа или вручную.</div>';
  }
  function orderOptions(){ return orders().map(function(o,i){return '<option value="'+i+'">'+esc((o.project||'Заказ')+' — '+(o.client||'')+' — '+(o.total?rub(o.total):''))+'</option>';}).join(''); }
  function openModal(j,index){
    ensureModal();
    document.getElementById('prodTitle').textContent=j.title||'Производственная задача';
    document.getElementById('prodSub').textContent=(j.client_name||'')+' '+(j.client_phone||'')+' • '+(j.order_project||'');
    document.getElementById('prodBody').innerHTML='<div class="prod-form"><div style="grid-column:span 6"><label>Название</label><input id="prodJobTitle" value="'+esc(j.title||'')+'"></div><div style="grid-column:span 3"><label>Статус</label><select id="prodJobStatus">'+statusOptions(j.production_status)+'</select></div><div style="grid-column:span 3"><label>Макет</label><select id="prodJobLayout">'+layoutOptions(j.layout_status)+'</select></div><div style="grid-column:span 4"><label>Подрядчик</label><select id="prodJobContractor">'+contractorOptions(j.contractor_index)+'</select></div><div style="grid-column:span 4"><label>Срок</label><input id="prodJobDeadline" type="datetime-local" value="'+esc(j.deadline||'')+'"></div><div style="grid-column:span 2"><label>Себестоимость</label><input id="prodJobCost" value="'+esc(j.contractor_cost||0)+'"></div><div style="grid-column:span 2"><label>Сумма клиенту</label><input id="prodJobTotal" value="'+esc(j.client_total||0)+'"></div><div style="grid-column:span 12"><label>Ссылка на макет / файл</label><input id="prodJobFile" value="'+esc(j.file_url||'')+'"></div><div style="grid-column:span 12"><label>Техническое задание подрядчику</label><textarea id="prodJobTask" rows="5">'+esc(j.technical_task||'')+'</textarea></div><div style="grid-column:span 6"><label>Комментарий подрядчику</label><textarea id="prodJobContractorComment" rows="3">'+esc(j.contractor_comment||'')+'</textarea></div><div style="grid-column:span 6"><label>Внутренний комментарий</label><textarea id="prodJobInternalComment" rows="3">'+esc(j.internal_comment||'')+'</textarea></div></div><div class="prod-actions no-print"><button class="primary" onclick="LeaderProduction.saveJob('+index+')">Сохранить</button><button onclick="LeaderProduction.printTask('+index+')">Печатное ТЗ</button><button onclick="LeaderProduction.copyBrief('+index+')">Скопировать сводку</button><button onclick="LeaderProduction.close()">Закрыть</button></div>';
    document.getElementById('prodBackdrop').classList.add('show');
  }
  function fromOrder(index){
    var o=orders()[index]||{};
    var items=(o.rows||[]).map(function(r,k){return (k+1)+'. '+(r.name||'')+' — '+(r.qty||'')+' '+(r.unit||'')+(r.comment?' — '+r.comment:'');}).join('\n');
    return {local_id:Date.now(),order_index:index,order_cloud_id:o.cloud_id||null,order_project:o.project||'',title:o.project||'Производство по заказу',client_name:o.client||'',client_phone:o.phone||'',production_status:'Не передано',layout_status:(o.info&&o.info.layout_status)||'Макет не проверен',contractor_index:0,contractor_name:(contractors()[0]||{}).name||'',deadline:o.deadline?o.deadline+'T18:00':'',contractor_cost:o.cost||0,client_total:o.total||0,file_url:(o.info&&o.info.layout_link)||'',technical_task:items,contractor_comment:'',internal_comment:(o.info&&o.info.comment)||''};
  }
  async function cloudSave(j){
    var client=db(); if(!client) return;
    try{
      var user=await client.auth.getUser(); if(!user.data.user) return;
      var payload={order_id:j.order_cloud_id||null,title:j.title,production_status:j.production_status,layout_status:j.layout_status,priority:j.priority||'Обычная',deadline:j.deadline||null,contractor_cost:Number(j.contractor_cost||0),client_total:Number(j.client_total||0),file_url:j.file_url||'',technical_task:j.technical_task||'',contractor_comment:j.contractor_comment||'',internal_comment:j.internal_comment||''};
      if(j.cloud_id){ await client.from('leader_production_jobs').update(payload).eq('id',j.cloud_id); }
      else { var r=await client.from('leader_production_jobs').insert(payload).select('id').single(); if(!r.error&&r.data) j.cloud_id=r.data.id; }
    }catch(e){ console.warn(e); }
  }
  window.LeaderProduction={
    refresh:function(){ renderJobs(); renderContractors(); },
    open:function(i){ openModal(jobs()[i], i); },
    openNew:function(){ var list=orders(); if(list.length){ var idx=Number(prompt('Номер заказа в списке заказов, начиная с 1. Пусто — ручная задача','1'))-1; var j=isNaN(idx)||idx<0?{local_id:Date.now(),title:'Новая производственная задача',production_status:'Не передано',layout_status:'Макет не проверен',contractor_index:0,contractor_name:(contractors()[0]||{}).name||'',deadline:'',contractor_cost:0,client_total:0,technical_task:''}:fromOrder(idx); var arr=jobs(); arr.unshift(j); saveJobs(arr); this.refresh(); this.open(0); } else { var arr=jobs(); arr.unshift({local_id:Date.now(),title:'Новая производственная задача',production_status:'Не передано',layout_status:'Макет не проверен',contractor_index:0,contractor_name:(contractors()[0]||{}).name||'',deadline:'',contractor_cost:0,client_total:0,technical_task:''}); saveJobs(arr); this.refresh(); this.open(0); }},
    close:function(){ document.getElementById('prodBackdrop').classList.remove('show'); },
    saveJob:function(i){ var arr=jobs(), j=arr[i]; if(!j) return; var old=j.production_status; j.title=document.getElementById('prodJobTitle').value; j.production_status=document.getElementById('prodJobStatus').value; j.layout_status=document.getElementById('prodJobLayout').value; j.contractor_index=document.getElementById('prodJobContractor').value; j.contractor_name=(contractors()[Number(j.contractor_index)]||{}).name||''; j.deadline=document.getElementById('prodJobDeadline').value; j.contractor_cost=document.getElementById('prodJobCost').value; j.client_total=document.getElementById('prodJobTotal').value; j.file_url=document.getElementById('prodJobFile').value; j.technical_task=document.getElementById('prodJobTask').value; j.contractor_comment=document.getElementById('prodJobContractorComment').value; j.internal_comment=document.getElementById('prodJobInternalComment').value; if(old!==j.production_status){ j.events=j.events||[]; j.events.unshift({date:new Date().toISOString(),old_status:old,new_status:j.production_status,body:'Смена статуса производства'}); } saveJobs(arr); cloudSave(j); this.refresh(); openModal(j,i); toast('Производственная задача сохранена'); },
    addContractor:function(){ var name=document.getElementById('prodContrName').value.trim(); if(!name) return; var list=contractors(); list.unshift({name:name,phone:document.getElementById('prodContrPhone').value,services:document.getElementById('prodContrServices').value}); saveContractors(list); document.getElementById('prodContrName').value=''; document.getElementById('prodContrPhone').value=''; document.getElementById('prodContrServices').value=''; this.refresh(); toast('Подрядчик добавлен'); },
    deleteContractor:function(i){ var list=contractors(); list.splice(i,1); saveContractors(list); this.refresh(); },
    printTask:function(i){ var j=jobs()[i]; if(!j) return; var html='<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}pre{white-space:pre-wrap}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:7px}</style></head><body><h2>РА «Лидер» — производственное ТЗ</h2><p><b>Заказ:</b> '+esc(j.title||'')+'<br><b>Клиент:</b> '+esc(j.client_name||'')+' '+esc(j.client_phone||'')+'<br><b>Подрядчик:</b> '+esc(j.contractor_name||'')+'<br><b>Срок:</b> '+esc(fmt(j.deadline))+'<br><b>Макет:</b> '+esc(j.layout_status||'')+'</p><h3>Техническое задание</h3><pre>'+esc(j.technical_task||'')+'</pre><h3>Комментарий подрядчику</h3><pre>'+esc(j.contractor_comment||'')+'</pre></body></html>'; var w=window.open('','_blank'); w.document.write(html); w.document.close(); w.print(); },
    copyBrief:function(i){ var j=jobs()[i]; if(!j) return; var text='Производство: '+(j.title||'')+'\nСтатус: '+(j.production_status||'')+'\nМакет: '+(j.layout_status||'')+'\nПодрядчик: '+(j.contractor_name||'')+'\nСрок: '+fmt(j.deadline)+'\nТЗ:\n'+(j.technical_task||''); navigator.clipboard.writeText(text); toast('Сводка производства скопирована'); },
    loadCloud:async function(){ var client=db(); if(!client) return alert('Нет Supabase'); var u=await client.auth.getUser(); if(!u.data.user) return alert('Войдите в облако'); var r=await client.from('leader_production_summary').select('*').order('updated_at',{ascending:false}); if(r.error) return alert(r.error.message); var arr=(r.data||[]).map(function(x){return {cloud_id:x.id,order_cloud_id:x.order_id,title:x.title||x.project_name,client_name:x.client_name,client_phone:x.client_phone,production_status:x.production_status,layout_status:x.layout_status,deadline:x.deadline,contractor_cost:x.contractor_cost,client_total:x.client_total,contractor_name:x.contractor_name,file_url:x.file_url};}); saveJobs(arr); this.refresh(); toast('Производство загружено'); }
  };
  function hookOrderCards(){
    var old=window.createOrder;
    if(typeof old==='function' && !old._prod){ var f=function(){ old(); setTimeout(function(){ var arr=jobs(); arr.unshift(fromOrder(0)); saveJobs(arr); toast('Создана производственная задача'); },300); }; f._prod=true; window.createOrder=f; }
  }
  document.addEventListener('DOMContentLoaded',function(){ ensureModal(); setTimeout(function(){addTab(); hookOrderCards(); LeaderProduction.refresh();},1000); });
})();
