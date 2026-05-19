// Safe production mode for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function fmt(v){ if(!v) return '—'; try{return new Date(v).toLocaleString('ru-RU')}catch(e){return v} }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  function profile(){ return read('current_profile', null); }
  function isSafeRole(){ var r=(profile()||{}).role; return ['designer','installer','contractor'].includes(r); }
  function jobs(){ return read('production_jobs', []); }
  function safeJobs(){ return read('production_safe_jobs', jobs().map(function(j){ return {id:j.cloud_id||j.id||j.local_id,title:j.title,project_name:j.order_project||j.title,production_status:j.production_status,layout_status:j.layout_status,priority:j.priority,deadline:j.deadline,contractor_name:j.contractor_name,file_url:j.file_url,technical_task:j.technical_task,contractor_comment:j.contractor_comment,created_at:j.created_at,updated_at:j.updated_at}; })); }
  function statusClass(s){ return s==='Проблема'?'psafe-hot':(s==='Готово'||s==='Выдано'?'psafe-good':'psafe-warn'); }
  function ensureModal(){
    if(document.getElementById('psafeBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="psafeBackdrop" class="psafe-backdrop"><div class="psafe-modal"><div class="psafe-head"><div><div id="psafeTitle" class="psafe-title">Производственное ТЗ</div><div id="psafeSub" class="psafe-meta"></div></div><button class="psafe-close" onclick="LeaderProductionSafe.close()">Закрыть</button></div><div id="psafeBody"></div></div></div>');
  }
  function addBanner(){
    var sec=document.getElementById('production'); if(!sec || document.getElementById('psafeBanner')) return;
    var div=document.createElement('div'); div.id='psafeBanner'; div.className='psafe-banner no-print';
    div.innerHTML='<div><b>Безопасный режим производства</b><div>Для дизайнера, монтажника и подрядчика: без маржи, себестоимости, финансов и лишних данных клиента.</div></div><button onclick="LeaderProductionSafe.openPanel()">Открыть чистое ТЗ</button>';
    sec.insertBefore(div, sec.firstChild);
  }
  function card(j,i){
    return '<div class="psafe-card"><b>'+esc(j.title||j.project_name||'Производственная задача')+'</b><div class="psafe-meta">Срок: '+fmt(j.deadline)+' • Подрядчик: '+esc(j.contractor_name||'—')+'</div><div><span class="psafe-pill '+statusClass(j.production_status)+'">'+esc(j.production_status||'Не передано')+'</span><span class="psafe-pill">'+esc(j.layout_status||'Макет не проверен')+'</span></div><div class="psafe-actions"><button onclick="LeaderProductionSafe.open('+i+')">Открыть ТЗ</button><button onclick="LeaderProductionSafe.copy('+i+')">Скопировать</button><button onclick="LeaderProductionSafe.print('+i+')">Печать</button></div></div>';
  }
  function renderPanel(){
    var sec=document.getElementById('production'); if(!sec) return;
    var host=document.getElementById('psafeList');
    if(!host){
      host=document.createElement('div'); host.id='psafeList'; host.className='psafe-safe-note';
      var b=document.getElementById('psafeBanner'); if(b) b.insertAdjacentElement('afterend', host); else sec.insertBefore(host, sec.firstChild);
    }
    var list=safeJobs();
    host.innerHTML='<b>Чистый список производственных задач</b>'+(list.length?list.map(card).join(''):'<div class="psafe-safe-note">Производственных задач пока нет</div>');
  }
  function openJob(j,i){
    ensureModal();
    document.getElementById('psafeTitle').textContent=j.title||j.project_name||'Производственное ТЗ';
    document.getElementById('psafeSub').textContent='Срок: '+fmt(j.deadline)+' • Статус: '+(j.production_status||'—');
    document.getElementById('psafeBody').innerHTML='<div><span class="psafe-pill '+statusClass(j.production_status)+'">'+esc(j.production_status||'Не передано')+'</span><span class="psafe-pill">'+esc(j.layout_status||'Макет не проверен')+'</span><span class="psafe-pill">'+esc(j.contractor_name||'подрядчик не указан')+'</span></div><h3>Техническое задание</h3><div class="psafe-task">'+esc(j.technical_task||'ТЗ не заполнено')+'</div><h3>Ссылка на макет / файл</h3><div class="psafe-task">'+(j.file_url?'<a href="'+esc(j.file_url)+'" target="_blank" rel="noopener">'+esc(j.file_url)+'</a>':'Файл не указан')+'</div><h3>Комментарий подрядчику</h3><div class="psafe-task">'+esc(j.contractor_comment||'—')+'</div><div class="psafe-form no-print" style="margin-top:12px"><textarea id="psafeNote" style="grid-column:span 10" rows="2" placeholder="Комментарий по производству"></textarea><button style="grid-column:span 2" onclick="LeaderProductionSafe.addNote('+i+')">Добавить</button></div><div class="psafe-actions no-print"><button onclick="LeaderProductionSafe.copy('+i+')">Скопировать ТЗ</button><button onclick="LeaderProductionSafe.print('+i+')">Печать</button><button onclick="LeaderProductionSafe.close()">Закрыть</button></div>';
    document.getElementById('psafeBackdrop').classList.add('show');
  }
  async function cloudNote(job, body){
    var client=db(); if(!client || !job.id) return;
    try{ var u=await client.auth.getUser(); if(!u.data.user) return; await client.rpc('leader_add_safe_production_note',{p_job_id:job.id,p_body:body}); }catch(e){ console.warn(e); }
  }
  window.LeaderProductionSafe={
    apply:function(){
      if(!document.getElementById('production')) return;
      addBanner();
      if(isSafeRole()){
        document.querySelectorAll('#production .prod-grid').forEach(function(x){x.classList.add('rg-hidden')});
        renderPanel();
      }
    },
    openPanel:function(){ renderPanel(); var x=document.getElementById('psafeList'); if(x) x.scrollIntoView({behavior:'smooth'}); },
    open:function(i){ var j=safeJobs()[i]; if(j) openJob(j,i); },
    close:function(){ var b=document.getElementById('psafeBackdrop'); if(b) b.classList.remove('show'); },
    copy:function(i){ var j=safeJobs()[i]; if(!j) return; var text='Производственное ТЗ\n'+(j.title||j.project_name||'')+'\nСрок: '+fmt(j.deadline)+'\nСтатус: '+(j.production_status||'')+'\nМакет: '+(j.layout_status||'')+'\nФайл: '+(j.file_url||'')+'\n\nТЗ:\n'+(j.technical_task||'')+'\n\nКомментарий:\n'+(j.contractor_comment||''); navigator.clipboard.writeText(text); toast('Чистое ТЗ скопировано'); },
    print:function(i){ var j=safeJobs()[i]; if(!j) return; var html='<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}pre{white-space:pre-wrap;background:#f7f7f7;padding:12px;border:1px solid #ddd}p{line-height:1.45}</style></head><body><h2>РА «Лидер» — производственное ТЗ</h2><p><b>Задача:</b> '+esc(j.title||j.project_name||'')+'<br><b>Срок:</b> '+esc(fmt(j.deadline))+'<br><b>Статус:</b> '+esc(j.production_status||'')+'<br><b>Макет:</b> '+esc(j.layout_status||'')+'<br><b>Файл:</b> '+esc(j.file_url||'—')+'</p><h3>Техническое задание</h3><pre>'+esc(j.technical_task||'')+'</pre><h3>Комментарий</h3><pre>'+esc(j.contractor_comment||'')+'</pre></body></html>'; var w=window.open('','_blank'); w.document.write(html); w.document.close(); w.print(); },
    addNote:async function(i){ var j=safeJobs()[i], el=document.getElementById('psafeNote'); if(!j||!el||!el.value.trim()) return; await cloudNote(j, el.value.trim()); toast('Комментарий добавлен'); el.value=''; }
  };
  document.addEventListener('DOMContentLoaded',function(){ ensureModal(); setInterval(function(){ if(window.LeaderProductionSafe) LeaderProductionSafe.apply(); },2500); });
})();
