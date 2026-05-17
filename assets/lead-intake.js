// Manual lead intake module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  function ensureModal(){
    if(document.getElementById('leadIntakeBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="leadIntakeBackdrop" class="li-backdrop"><div class="li-modal"><div class="li-head"><div><div class="li-title">Новая заявка вручную</div><div class="li-note">Для заявок из MAX, ВК, звонков, Авито и личных обращений.</div></div><button class="li-close" onclick="LeaderLeadIntake.close()">Закрыть</button></div><div class="li-grid"><div style="grid-column:span 4"><label>Имя / организация</label><input id="liName" placeholder="Иван / ООО Ромашка"></div><div style="grid-column:span 3"><label>Телефон</label><input id="liPhone" placeholder="+7..."></div><div style="grid-column:span 3"><label>Источник</label><select id="liSource"><option>MAX</option><option>ВК</option><option>Звонок</option><option>Авито</option><option>Сайт</option><option>Яндекс Карты</option><option>2ГИС</option><option>Рекомендация</option><option>Постоянный клиент</option><option>Другое</option></select></div><div style="grid-column:span 2"><label>Качество</label><select id="liQuality"><option>Не оценена</option><option>Горячая</option><option>Тёплая</option><option>Холодная</option><option>Нецелевая</option></select></div><div style="grid-column:span 4"><label>Услуга</label><select id="liService"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Плоттерная резка</option><option>Перфорированная плёнка</option><option>Дизайн</option><option>Монтаж</option><option>Комплексная реклама</option><option>Другое</option></select></div><div style="grid-column:span 3"><label>Оценка суммы</label><input id="liAmount" placeholder="0"></div><div style="grid-column:span 5"><label>Следующий контакт</label><input id="liNext" type="datetime-local"></div><div style="grid-column:span 12"><label>Сообщение / суть заявки</label><textarea id="liMessage" rows="4" placeholder="Что нужно клиенту, размеры, сроки, пожелания..."></textarea></div></div><div class="li-actions"><button class="primary" onclick="LeaderLeadIntake.save(false)">Сохранить заявку</button><button onclick="LeaderLeadIntake.save(true)">Сохранить и в расчёт</button><button onclick="LeaderLeadIntake.fillFromCalc()">Взять клиента из расчёта</button></div></div></div>');
  }
  function clear(){ ['liName','liPhone','liAmount','liMessage','liNext'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; }); var q=document.getElementById('liQuality'); if(q) q.value='Не оценена'; }
  function addButton(){
    var leads=document.getElementById('leads'); if(!leads || document.getElementById('addManualLeadBtn')) return;
    var row=leads.querySelector('.card .row');
    if(!row) return;
    var btn=document.createElement('button');
    btn.id='addManualLeadBtn';
    btn.className='primary';
    btn.textContent='Новая заявка';
    btn.onclick=function(){ LeaderLeadIntake.open(); };
    row.appendChild(btn);
  }
  async function saveCloud(lead){
    var client=db(); if(!client) return null;
    try{
      var user=await client.auth.getUser(); if(!user.data.user) return null;
      var res=await client.from('leader_leads').insert({
        name:lead.name, phone:lead.phone, source:lead.source, service:lead.service, message:lead.message,
        status:lead.status, lead_quality:lead.lead_quality, estimated_amount:Number(lead.estimated_amount||0),
        next_contact_at:lead.next_contact_at || null, payload:{manual:true}
      }).select('id,created_at').single();
      if(res.error){ console.warn(res.error); return null; }
      return res.data;
    }catch(e){ console.warn(e); return null; }
  }
  window.LeaderLeadIntake={
    open:function(){ ensureModal(); document.getElementById('leadIntakeBackdrop').classList.add('show'); },
    close:function(){ document.getElementById('leadIntakeBackdrop').classList.remove('show'); },
    fillFromCalc:function(){
      var n=document.getElementById('clientName'), p=document.getElementById('clientPhone'), s=document.getElementById('source'), c=document.getElementById('orderComment');
      if(n) document.getElementById('liName').value=n.value;
      if(p) document.getElementById('liPhone').value=p.value;
      if(s) document.getElementById('liSource').value=s.value;
      if(c) document.getElementById('liMessage').value=c.value;
      toast('Данные из расчёта подставлены');
    },
    save:async function(toCalc){
      var lead={
        local_id:Date.now(),
        created_at:new Date().toISOString(),
        name:document.getElementById('liName').value.trim(),
        phone:document.getElementById('liPhone').value.trim(),
        source:document.getElementById('liSource').value,
        service:document.getElementById('liService').value,
        message:document.getElementById('liMessage').value.trim(),
        status:'Новая',
        lead_quality:document.getElementById('liQuality').value,
        estimated_amount:document.getElementById('liAmount').value,
        next_contact_at:document.getElementById('liNext').value || null,
        payload:{manual:true}
      };
      if(!lead.phone && !lead.message){ alert('Укажите телефон или суть заявки'); return; }
      var cloud=await saveCloud(lead);
      if(cloud){ lead.id=cloud.id; lead.created_at=cloud.created_at; }
      var leads=read('leads', []); leads.unshift(lead); write('leads', leads);
      if(window.renderLeads) window.renderLeads();
      toast(cloud?'Заявка сохранена в облако':'Заявка сохранена локально');
      if(toCalc && window.LeaderLeadCard){ setTimeout(function(){ window.LeaderLeadCard.toCalc(0); },200); }
      clear();
      this.close();
    }
  };
  document.addEventListener('DOMContentLoaded',function(){ ensureModal(); setInterval(addButton,1200); });
})();
