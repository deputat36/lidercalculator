// Templates module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  const DEFAULT_MESSAGES=[
    {name:'КП отправлено',category:'КП',channel:'MAX',body:'Здравствуйте! Подготовили предварительный расчёт по вашему заказу. Стоимость: {total}. Если всё устраивает, можем запускать в работу после согласования макета и предоплаты.'},
    {name:'Нужен макет',category:'Макет',channel:'MAX',body:'Здравствуйте! Для запуска заказа нужен макет в хорошем качестве. Если макета нет, можем подготовить дизайн отдельно.'},
    {name:'Заказ готов',category:'Готовность',channel:'MAX',body:'Здравствуйте! Ваш заказ готов. Можно забирать/согласовать доставку. Остаток к оплате: {debt}.'},
    {name:'Напоминание об оплате',category:'Оплата',channel:'MAX',body:'Здравствуйте! Напоминаем по заказу «{project}». Остаток к оплате: {debt}.'}
  ];
  function calcTemplates(){ return read('calc_templates', []); }
  function msgTemplates(){ return read('message_templates', DEFAULT_MESSAGES); }
  function saveCalc(v){ write('calc_templates', v); }
  function saveMsg(v){ write('message_templates', v); }
  function currentRows(){ return read('rows', []); }
  function currentOrderInfo(){
    function val(id){ var e=document.getElementById(id); return e?e.value:''; }
    return {client_name:val('clientName'),client_phone:val('clientPhone'),source:val('source'),deadline:val('deadline'),comment:val('orderComment'),project:val('projectName')};
  }
  function applyVars(text){
    function txt(id){ var e=document.getElementById(id); return e?e.textContent:'0 ₽'; }
    var info=currentOrderInfo();
    return String(text||'')
      .replaceAll('{client}', info.client_name||'клиент')
      .replaceAll('{phone}', info.client_phone||'')
      .replaceAll('{project}', info.project||'заказ')
      .replaceAll('{total}', txt('sumTotal'))
      .replaceAll('{debt}', txt('sumDebt'))
      .replaceAll('{profit}', txt('sumProfit'));
  }
  function addTab(){
    if(document.querySelector('[data-tab="templates"]')) return;
    var tabs=document.querySelector('.tabs'), wrap=document.querySelector('.wrap'); if(!tabs||!wrap) return;
    var tab=document.createElement('div'); tab.className='tab'; tab.dataset.tab='templates'; tab.textContent='Шаблоны'; tabs.appendChild(tab);
    var sec=document.createElement('section'); sec.id='templates'; sec.className='page hidden';
    sec.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><div><b>Шаблоны</b><div class="muted">Типовые расчёты и сообщения клиентам.</div></div><button onclick="LeaderTemplates.refresh()">Обновить</button></div><div class="tpl-grid" style="margin-top:12px"><div class="tpl-card" style="grid-column:span 6"><b>Шаблоны расчётов</b><div class="tpl-form" style="margin-top:8px"><input id="tplCalcName" style="grid-column:span 5" placeholder="Название шаблона"><input id="tplCalcCategory" style="grid-column:span 3" placeholder="Категория" value="Общее"><input id="tplCalcTags" style="grid-column:span 4" placeholder="Теги через запятую"><textarea id="tplCalcDesc" style="grid-column:span 12" rows="2" placeholder="Описание"></textarea><button class="primary" style="grid-column:span 6" onclick="LeaderTemplates.saveCurrentCalc()">Сохранить текущий расчёт как шаблон</button><button style="grid-column:span 6" onclick="LeaderTemplates.loadCloudCalcTemplates()">Загрузить из облака</button></div><div id="tplCalcList" class="tpl-list" style="margin-top:10px"></div></div><div class="tpl-card" style="grid-column:span 6"><b>Шаблоны сообщений</b><div class="tpl-form" style="margin-top:8px"><input id="tplMsgName" style="grid-column:span 4" placeholder="Название"><input id="tplMsgCategory" style="grid-column:span 3" placeholder="Категория"><select id="tplMsgChannel" style="grid-column:span 2"><option>MAX</option><option>ВК</option><option>SMS</option><option>Email</option></select><button style="grid-column:span 3" onclick="LeaderTemplates.addMessage()">Добавить</button><textarea id="tplMsgBody" style="grid-column:span 12" rows="4" placeholder="Текст. Переменные: {client}, {phone}, {project}, {total}, {debt}, {profit}"></textarea></div><div id="tplMsgList" class="tpl-list" style="margin-top:10px"></div></div></div></div>';
    wrap.appendChild(sec);
    tab.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden');LeaderTemplates.refresh();};
  }
  async function saveCalcCloud(tpl){
    var client=db(); if(!client) return;
    try{ var u=await client.auth.getUser(); if(!u.data.user) return; await client.from('leader_calculation_templates').upsert({name:tpl.name,category:tpl.category,description:tpl.description,items:tpl.items,settings:tpl.settings,tags:tpl.tags,is_active:true},{onConflict:'owner_id,name'}); }catch(e){console.warn(e)}
  }
  async function saveMsgCloud(tpl){
    var client=db(); if(!client) return;
    try{ var u=await client.auth.getUser(); if(!u.data.user) return; await client.from('leader_message_templates').upsert({name:tpl.name,category:tpl.category,channel:tpl.channel,body:tpl.body,is_active:true},{onConflict:'owner_id,name'}); }catch(e){console.warn(e)}
  }
  window.LeaderTemplates={
    refresh:function(){
      var cl=calcTemplates(), ml=msgTemplates();
      var calc=document.getElementById('tplCalcList');
      if(calc) calc.innerHTML=cl.length?cl.map(function(t,i){return '<div class="tpl-card"><b>'+esc(t.name)+'</b><div class="tpl-meta">'+esc(t.category||'')+' • '+(t.items||[]).length+' позиций</div><div>'+esc(t.description||'')+'</div><div>'+(t.tags||[]).map(x=>'<span class="tpl-pill">'+esc(x)+'</span>').join('')+'</div><div class="tpl-actions"><button onclick="LeaderTemplates.applyCalc('+i+')">Применить</button><button onclick="LeaderTemplates.deleteCalc('+i+')" class="danger">Удалить</button></div></div>'}).join(''):'<div class="tpl-empty">Пока нет шаблонов расчёта. Соберите типовой расчёт и сохраните его.</div>';
      var msg=document.getElementById('tplMsgList');
      if(msg) msg.innerHTML=ml.length?ml.map(function(t,i){return '<div class="tpl-card"><b>'+esc(t.name)+'</b><div class="tpl-meta">'+esc(t.category||'')+' • '+esc(t.channel||'')+'</div><div class="tpl-preview">'+esc(applyVars(t.body))+'</div><div class="tpl-actions"><button onclick="LeaderTemplates.copyMsg('+i+')">Скопировать</button><button onclick="LeaderTemplates.deleteMsg('+i+')" class="danger">Удалить</button></div></div>'}).join(''):'<div class="tpl-empty">Шаблонов сообщений нет.</div>';
    },
    saveCurrentCalc:function(){
      var name=document.getElementById('tplCalcName').value.trim(); if(!name) return alert('Введите название шаблона');
      var tpl={id:Date.now(),name:name,category:document.getElementById('tplCalcCategory').value||'Общее',description:document.getElementById('tplCalcDesc').value||'',tags:(document.getElementById('tplCalcTags').value||'').split(',').map(s=>s.trim()).filter(Boolean),items:currentRows(),settings:{},created_at:new Date().toISOString()};
      var list=calcTemplates(); list.unshift(tpl); saveCalc(list); saveCalcCloud(tpl); this.refresh(); toast('Шаблон расчёта сохранён');
    },
    applyCalc:function(i){ var tpl=calcTemplates()[i]; if(!tpl) return; write('rows', tpl.items||[]); if(window.renderRows) window.renderRows(); var tab=document.querySelector('[data-tab="calc"]'); if(tab) tab.click(); toast('Шаблон применён'); },
    deleteCalc:function(i){ var list=calcTemplates(); list.splice(i,1); saveCalc(list); this.refresh(); },
    addMessage:function(){ var name=document.getElementById('tplMsgName').value.trim(), body=document.getElementById('tplMsgBody').value.trim(); if(!name||!body) return alert('Введите название и текст'); var tpl={id:Date.now(),name:name,category:document.getElementById('tplMsgCategory').value||'Общее',channel:document.getElementById('tplMsgChannel').value,body:body}; var list=msgTemplates(); list.unshift(tpl); saveMsg(list); saveMsgCloud(tpl); this.refresh(); toast('Шаблон сообщения добавлен'); },
    copyMsg:function(i){ var tpl=msgTemplates()[i]; if(!tpl) return; navigator.clipboard.writeText(applyVars(tpl.body)); toast('Сообщение скопировано'); },
    deleteMsg:function(i){ var list=msgTemplates(); list.splice(i,1); saveMsg(list); this.refresh(); },
    loadCloudCalcTemplates:async function(){ var client=db(); if(!client) return alert('Нет подключения Supabase'); var u=await client.auth.getUser(); if(!u.data.user) return alert('Войдите в облако'); var r=await client.from('leader_calculation_templates').select('*').eq('is_active',true).order('updated_at',{ascending:false}); if(r.error) return alert(r.error.message); saveCalc((r.data||[]).map(function(x){return {cloud_id:x.id,name:x.name,category:x.category,description:x.description,tags:x.tags||[],items:x.items||[],settings:x.settings||{}}})); this.refresh(); toast('Шаблоны загружены'); }
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){addTab(); LeaderTemplates.refresh();},1000); });
})();
