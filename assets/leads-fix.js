// Site leads repair module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function db(){ return window.db || null; }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function fmt(v){ if(!v) return '—'; try{return new Date(v).toLocaleString('ru-RU')}catch(e){return v} }

  async function loadViaRpc(){
    var client=db();
    if(!client) throw new Error('Supabase client не найден');
    var u=await client.auth.getUser();
    if(!u.data.user) throw new Error('Сначала войдите в CRM');
    var r=await client.rpc('leader_get_leads_for_crm');
    if(r.error) throw new Error(r.error.message);
    write('leads', r.data || []);
    try { window.leads = r.data || []; } catch(e) {}
    return r.data || [];
  }

  function addBox(){
    var sec=document.getElementById('leads');
    if(!sec || document.getElementById('lfxBox')) return;
    var card=sec.querySelector('.card') || sec;
    var box=document.createElement('div');
    box.id='lfxBox';
    box.className='lfx-box';
    box.innerHTML='<b>Заявки с сайта</b><div>Если обычная кнопка загрузки не показывает заявку, используйте аварийную загрузку через RPC.</div><div class="lfx-actions"><button class="primary" onclick="LeaderLeadsFix.loadAndRender()">Загрузить заявки с сайта</button><button onclick="LeaderLeadsFix.showLocal()">Показать локально</button></div><div id="lfxList" class="lfx-list"></div>';
    card.insertBefore(box, card.firstChild);
  }

  function render(list){
    var box=document.getElementById('lfxList');
    if(!box) return;
    if(!list || !list.length){ box.innerHTML='<div class="lfx-empty">Заявок пока нет</div>'; return; }
    box.innerHTML=list.slice(0,20).map(function(l,i){
      return '<div class="lfx-card"><b>'+esc(l.name || l.phone || 'Заявка')+'</b><div class="lfx-meta">'+fmt(l.created_at)+' • '+esc(l.source||'')+' • '+esc(l.service||'')+'</div><div>'+esc(l.phone||'')+'</div><div>'+esc(l.message||'')+'</div><div><span class="lfx-pill">'+esc(l.status||'Новая')+'</span>'+(l.page_url?'<span class="lfx-pill">с сайта</span>':'')+'</div><div class="lfx-actions"><button onclick="LeaderLeadsFix.toCalc('+i+')">В расчёт</button><button onclick="LeaderLeadsFix.copy('+i+')">Скопировать</button></div></div>';
    }).join('');
  }

  window.LeaderLeadsFix={
    async loadAndRender(){
      try{
        var list=await loadViaRpc();
        render(list);
        if(window.renderLeads){
          try{ window.renderLeads(); }catch(e){ console.warn(e); }
        }
        toast('Заявки загружены: '+list.length);
      }catch(e){
        alert(e.message);
      }
    },
    showLocal:function(){ render(read('leads', [])); },
    toCalc:function(i){
      var list=read('leads', []), l=list[i]; if(!l) return;
      if(typeof window.applyInfo === 'function') window.applyInfo({name:l.name,phone:l.phone,source:l.source||'Сайт',message:l.message,comment:l.message});
      var pn=document.getElementById('projectName'); if(pn) pn.value='Заявка '+(l.name||l.phone||'с сайта');
      var tab=document.querySelector('[data-tab="calc"]'); if(tab) tab.click();
    },
    copy:function(i){
      var list=read('leads', []), l=list[i]; if(!l) return;
      navigator.clipboard.writeText('Заявка\nИмя: '+(l.name||'')+'\nТелефон: '+(l.phone||'')+'\nУслуга: '+(l.service||'')+'\nСообщение: '+(l.message||''));
      toast('Заявка скопирована');
    },
    install:function(){ addBox(); }
  };

  document.addEventListener('DOMContentLoaded',function(){ setInterval(addBox,1200); });
})();
